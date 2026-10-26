import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseClient } from "../supabase/client";
import { adminApi } from "./api";
import type { AdminApi, Identity } from "./types";
import type { Session } from "@supabase/supabase-js";
import { AdminContext, mfaStep, type StaffMfaAdmission } from "./admission";
import StaffMfaBoundary from "./StaffMfa";
import { Notice } from "./ui";
import { portalRole } from "./permissions";

export function AdminProvider({
  children,
  fixture,
}: {
  children: ReactNode;
  fixture?: { api: AdminApi; identity: Identity };
}) {
  const [identity, setIdentity] = useState<Identity | null>(
    fixture?.identity ?? null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState<StaffMfaAdmission | null>(null);
  const [signOutState, setSignOutState] = useState<"pending" | "failed" | null>(null);
  const signOutAttempt = useRef<{ pending: boolean } | null>(null);
  const epoch = useRef(0);
  const verifiedIdentityId = useRef<string | undefined>(fixture?.identity.id);
  const api = fixture?.api ?? adminApi;
  const refresh = useCallback(async () => {
    if (fixture || signOutAttempt.current) return;
    const request = ++epoch.current;
    // Keep forms mounted during background validation. Initial sessions and
    // account switches still wait behind the route guard.
    let session: Session | null = null;
    try {
      const { data, error: sessionError } =
        await getSupabaseClient().auth.getSession();
      if (request !== epoch.current) return;
      if (!verifiedIdentityId.current) setLoading(true);
      setError("");
      if (sessionError) throw sessionError;
      session = data.session;
      const next = data.session ? await api.identity() : null;
      if (
        data.session &&
        (!next?.id || next.id !== data.session.user.id || !portalRole(next))
      ) {
        throw new Error("This account does not have admin portal access.");
      }
      if (request === epoch.current) {
        verifiedIdentityId.current = next?.id;
        setMfa(null);
        setIdentity(next);
      }
    } catch (e) {
      if (request === epoch.current) {
        verifiedIdentityId.current = undefined;
        setIdentity(null);
        const step = mfaStep(e);
        const nextMfa = step && session ? { step, session } : null;
        setMfa((previous) => previous?.step === nextMfa?.step &&
          previous?.session.access_token === nextMfa?.session.access_token ? previous : nextMfa);
        setError(
          e instanceof Error ? e.message : "Unable to verify portal access.",
        );
      }
    } finally {
      if (request === epoch.current) setLoading(false);
    }
  }, [api, fixture]);
  useEffect(() => {
    if (fixture) return;
    const invalidate = () => { ++epoch.current; };
    const initialEpoch = epoch.current;
    queueMicrotask(() => {
      if (initialEpoch === epoch.current) void refresh();
    });
    let subscription: { unsubscribe(): void } | undefined;
    try {
      subscription = getSupabaseClient().auth.onAuthStateChange(
        (event) => {
          if (event === "SIGNED_OUT") {
            invalidate();
            signOutAttempt.current = null;
            setSignOutState(null);
            verifiedIdentityId.current = undefined;
            setIdentity(null);
            setMfa(null);
            setLoading(false);
            setError("");
          } else if (event !== "INITIAL_SESSION") {
            // Invalidate before the queued read, including same-user replacement.
            invalidate();
            if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
              signOutAttempt.current = null;
              setSignOutState(null);
              setMfa(null);
              verifiedIdentityId.current = undefined;
              setIdentity(null);
              setLoading(true);
            }
            const scheduledEpoch = epoch.current;
            queueMicrotask(() => {
              if (scheduledEpoch === epoch.current) void refresh();
            });
          }
        },
      ).data.subscription;
    } catch {
      /* refresh displays configuration errors */
    }
    const recheck = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", recheck);
    return () => {
      invalidate();
      signOutAttempt.current = null;
      subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [fixture, refresh]);
  const signOut = async () => {
    if (fixture || signOutAttempt.current?.pending) return;
    const run = { pending: true };
    signOutAttempt.current = run;
    setSignOutState("pending");
    ++epoch.current;
    verifiedIdentityId.current = undefined;
    setIdentity(null);
    setMfa(null);
    setLoading(false);
    setError("");
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      if (signOutAttempt.current === run) {
        signOutAttempt.current = null;
        setSignOutState(null);
      }
    } catch (cause) {
      const message = "Unable to sign out. Your session may still be active. Retry sign out.";
      if (signOutAttempt.current === run) {
        run.pending = false;
        setSignOutState("failed");
        setError(message);
      }
      throw new Error(message, { cause });
    }
  };
  return (
    <AdminContext.Provider
      value={{
        api,
        identity,
        loading,
        error,
        refresh,
        signOut,
        preview: Boolean(fixture),
      }}
    >
      {signOutState ? <div className="admin-portal ap-access">
        <h1>{signOutState === "pending" ? "Signing out" : "Sign-out incomplete"}</h1>
        {signOutState === "pending" ? <p role="status">Signing out...</p> : <Notice>{error}</Notice>}
        <button className="ap-button" disabled={signOutState === "pending"}
          onClick={() => { void signOut().catch(() => { /* Provider retains the retryable error. */ }); }}>
          {signOutState === "pending" ? "Signing out..." : "Retry sign out"}
        </button>
        <a href="/support">Account recovery support</a>
      </div> : mfa ? <StaffMfaBoundary admission={mfa} refresh={refresh} signOut={signOut}>{children}</StaffMfaBoundary> : children}
    </AdminContext.Provider>
  );
}
