import type { Session, SupabaseClient } from "@supabase/supabase-js";

export interface TotpFactor { id: string; friendly_name?: string; }
export interface TotpEnrollment { id: string; secret: string; uri: string; }
const changed = () => new Error("Your session changed. Sign in again before continuing.");
interface BoundRefresh {
  supportsSessionBoundRefresh(): boolean;
  refreshSessionIfCurrent(params: {
    refresh_token: string;
    expectedAccessToken: string;
    expectedUserId: string;
  }): ReturnType<SupabaseClient["auth"]["refreshSession"]>;
}

// No temporary Auth client: every request uses the initiating bearer and cannot
// save credentials, broadcast an Auth event, or select a replacement account.
export function staffMfaAttempt(
  client: Pick<SupabaseClient, "auth">,
  session: Session,
  isOnPage: () => boolean,
  config: { url: string; anonKey: string; fetch?: typeof fetch },
) {
  let active = true;
  let identityCurrent = true;
  const controller = new AbortController();
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") {
      identityCurrent = false;
      controller.abort();
    }
  });
  const current = () => active && identityCurrent && isOnPage();
  const assertCurrent = () => { if (!current()) throw changed(); };
  const auth = client.auth as typeof client.auth & Partial<BoundRefresh>;
  // Neither the installed SDK nor v1's marker enables this opt-in API.
  const supported = () => typeof auth.refreshSessionIfCurrent === "function" &&
    typeof auth.supportsSessionBoundRefresh === "function" && auth.supportsSessionBoundRefresh();
  const request = async (path: string, body?: Record<string, unknown>) => {
    assertCurrent();
    const snapshot = await client.auth.getSession();
    assertCurrent();
    if (snapshot.error || snapshot.data.session?.access_token !== session.access_token) throw changed();
    const response = await (config.fetch ?? fetch)(`${config.url}/auth/v1/${path}`, {
      method: body ? "POST" : "GET", signal: controller.signal,
      headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assertCurrent();
    const data: unknown = await response.json();
    assertCurrent();
    if (!response.ok) throw new Error("Authenticator request failed. Check your code and try again.");
    if (!data || typeof data !== "object") throw new Error("Authenticator service returned an invalid response.");
    return data as Record<string, unknown>;
  };
  return {
    current,
    supported,
    close() { active = false; controller.abort(); subscription.unsubscribe(); },
    async factors(): Promise<TotpFactor[]> {
      const data = await request("user");
      if (data.id !== session.user.id || (data.factors !== undefined && !Array.isArray(data.factors))) throw changed();
      return ((data.factors ?? []) as unknown[]).filter((value): value is TotpFactor => {
        if (!value || typeof value !== "object") return false;
        const factor = value as Record<string, unknown>;
        return typeof factor.id === "string" && factor.factor_type === "totp" && factor.status === "verified" &&
          (factor.friendly_name === undefined || typeof factor.friendly_name === "string");
      });
    },
    async enroll(): Promise<TotpEnrollment> {
      if (!supported()) throw new Error("Authenticator setup is awaiting a security update. Contact your portal administrator.");
      const data = await request("factors", { factor_type: "totp", friendly_name: "CleanStream staff", issuer: "CleanStream" });
      const totp = data.totp as Record<string, unknown> | undefined;
      if (typeof data.id !== "string" || typeof totp?.secret !== "string" || typeof totp.uri !== "string" || !totp.uri.startsWith("otpauth://totp/")) {
        throw new Error("Authenticator setup returned an invalid response.");
      }
      return { id: data.id, secret: totp.secret, uri: totp.uri };
    },
    async verify(factorId: string, code: string) {
      assertCurrent();
      const refreshIfCurrent = auth.refreshSessionIfCurrent;
      if (!supported() || !refreshIfCurrent) throw new Error("Authenticator verification is awaiting a security update. Contact your portal administrator.");
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit authenticator code.");
      const challenge = await request(`factors/${encodeURIComponent(factorId)}/challenge`, {});
      if (typeof challenge.id !== "string") throw new Error("Authenticator challenge is unavailable. Try again.");
      const verified = await request(`factors/${encodeURIComponent(factorId)}/verify`, { challenge_id: challenge.id, code });
      const verifiedUser = verified.user as Record<string, unknown> | undefined;
      if (typeof verified.refresh_token !== "string" || !verified.refresh_token || verifiedUser?.id !== session.user.id) {
        throw new Error("Authenticator verification returned an invalid response.");
      }
      assertCurrent();
      const result = await refreshIfCurrent.call(auth, {
        refresh_token: verified.refresh_token,
        expectedAccessToken: session.access_token,
        expectedUserId: session.user.id,
      });
      assertCurrent();
      if (result.error || result.data.session?.user.id !== session.user.id) throw changed();
      // Callers must re-run backend admission; a successful token refresh is
      // not proof of role, lifecycle, location, or current-session access.
    },
  };
}
