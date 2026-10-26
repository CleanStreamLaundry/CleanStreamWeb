import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { getSupabaseClient } from "../supabase/client";
import logo from "../assets/Logo-web.png";
import { useAdmin } from "./context";
import { Field, Notice } from "./ui";

export default function AuthPages() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh, identity } = useAdmin();
  const recovery = location.pathname.includes("forgot-password");
  const setup =
    location.pathname.includes("accept-invite") ||
    location.pathname.includes("reset-password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const callback = setup ? location.search + location.hash : "";
  const [owner, setOwner] = useState(() => ({
    pathname: location.pathname,
    callback,
    href: window.location.href,
  }));
  const [verification, setVerification] = useState<{
    owner: typeof owner;
    error: string;
  } | null>(null);
  const [submission, setSubmission] = useState<{
    owner: typeof owner;
    pending: boolean;
    error: string;
    sent: boolean;
  } | null>(null);
  const current = useRef<{
    owner: typeof owner;
    href: string;
    submitting: boolean;
  } | null>(null);
  const otpFlight = useRef<{
    owner: typeof owner;
    promise: Promise<{ error: Error | null }>;
  } | null>(null);
  if (owner.pathname !== location.pathname || owner.callback !== callback) {
    setOwner({
      pathname: location.pathname,
      callback,
      href: window.location.href,
    });
  }
  if (owner.pathname !== location.pathname) {
    setPassword("");
    setConfirmation("");
  }
  const verified = verification?.owner === owner ? verification : null;
  const submitted = submission?.owner === owner ? submission : null;
  const busy = (setup && !verified) || !!submitted?.pending;
  const validLink = !!verified && !verified.error;
  const error = submitted?.error || verified?.error || "";
  const sent = !!submitted?.sent;
  useEffect(() => {
    if (identity && !setup && !recovery) navigate("/home", { replace: true });
  }, [identity, setup, recovery, navigate]);
  useEffect(() => {
    const run = { owner, href: owner.href, submitting: false };
    current.current = run;
    const isCurrent = () => current.current === run;
    const verify = async () => {
      const url = new URL(owner.href);
      const params = url.searchParams;
      const fragment = new URLSearchParams(url.hash.slice(1));
      // Only the SDK's cleanup of this captured callback may change its URL.
      const cleaned = new URL(owner.href);
      if (!params.has("token_hash")) {
        if (params.has("code")) cleaned.searchParams.delete("code");
        else if (fragment.has("access_token")) cleaned.hash = "";
      }
      const ownsDocument = () =>
        window.location.href === run.href ||
        (!params.has("token_hash") && window.location.href === cleaned.href);
      try {
        if (!isCurrent() || !ownsDocument()) return;
        if (params.has("error") || fragment.has("error"))
          throw new Error(
            "This link has expired or has already been used. Request a new recovery link.",
          );
        const client = getSupabaseClient();
        if (params.has("token_hash")) {
          const type = params.get("type");
          if (type !== "invite" && type !== "recovery")
            throw new Error("Invalid account setup link.");
          // Effect replay shares the call, never its obsolete UI continuation.
          if (otpFlight.current?.owner !== owner) {
            otpFlight.current = {
              owner,
              promise: client.auth.verifyOtp({
                token_hash: params.get("token_hash")!,
                type,
              }),
            };
          }
          const { error: verifyError } = await otpFlight.current.promise;
          if (!isCurrent() || !ownsDocument()) return;
          if (verifyError) throw verifyError;
          window.history.replaceState(null, "", owner.pathname);
          run.href = window.location.href;
        }
        const { data, error: sessionError } = await client.auth.getSession();
        if (!isCurrent() || !ownsDocument()) return;
        if (sessionError || !data.session)
          throw new Error(
            "This link is invalid or expired. Request a new link to continue.",
          );
        run.href = window.location.href;
        return { owner, error: "" };
      } catch (e) {
        if (isCurrent() && ownsDocument()) {
          run.href = window.location.href;
          return {
            owner,
            error: e instanceof Error ? e.message : "Unable to verify link.",
          };
        }
      }
    };
    if (setup)
      void verify().then((result) => {
        if (isCurrent() && result && window.location.href === run.href)
          setVerification(result);
      });
    return () => {
      if (isCurrent()) current.current = null;
    };
  }, [setup, owner]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const run = current.current;
    if (busy || !run || run.owner !== owner || run.submitting) return;
    const isCurrent = () =>
      current.current === run &&
      (!setup || window.location.href === run.href);
    if (!isCurrent()) return;
    run.submitting = true;
    setSubmission({ owner, pending: true, error: "", sent: false });
    let result = { owner, pending: false, error: "", sent: false };
    try {
      const client = getSupabaseClient();
      if (recovery) {
        const { error: sendError } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/admin/reset-password` },
        );
        if (!isCurrent()) return;
        if (sendError) throw sendError;
        result = { ...result, sent: true };
      } else if (setup) {
        if (!validLink)
          throw new Error("Request a new setup link to continue.");
        if (password.length < 12)
          throw new Error("Use at least 12 characters for your password.");
        if (password !== confirmation)
          throw new Error("The passwords do not match.");
        const { error: updateError } = await client.auth.updateUser({
          password,
        });
        if (!isCurrent()) return;
        if (updateError) throw updateError;
        await refresh();
        if (!isCurrent()) return;
        navigate("/home", { replace: true });
      } else {
        const { error: loginError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!isCurrent()) return;
        if (loginError)
          throw new Error(
            "We couldn’t sign you in. Check your email and password.",
          );
        await refresh();
        if (!isCurrent()) return;
        navigate("/home", { replace: true });
      }
    } catch (e) {
      result = {
        ...result,
        error: e instanceof Error ? e.message : "Unable to complete this request.",
      };
    } finally {
      if (isCurrent()) {
        run.submitting = false;
        setSubmission(result);
      }
    }
  };
  return (
    <div className="admin-portal ap-auth">
      <div className="ap-auth-brand">
        <img src={logo} alt="Clean Stream Laundry Solutions" />
        <p>YOUR LAUNDRY. CLEARLY MANAGED.</p>
        <h1>
          A clearer view of
          <br />
          your daily operations.
        </h1>
        <p>
          Locations, machines, and the people
          <br />
          who keep everything running.
        </p>
        <span className="ap-brand-lines" aria-hidden="true" />
      </div>
      <main className="ap-auth-main">
        <div className="ap-auth-card">
          <span className="ap-auth-icon">
            <LockKeyhole size={23} />
          </span>
          <p className="ap-eyebrow">CLEANSTREAM ADMIN</p>
          <h1>
            {recovery
              ? "Reset your password"
              : setup
                ? "Set your password"
                : "Welcome back"}
          </h1>
          <p>
            {recovery
              ? "We’ll email a secure link to your account."
              : setup
                ? "Choose a password to access your workspace."
                : "Sign in to your operations workspace."}
          </p>
          {error && <Notice>{error}</Notice>}
          {sent ? (
            <Notice kind="success">
              If an account exists for this email, a password reset link is on
              its way. Check your inbox and spam folder.
            </Notice>
          ) : (
            <form onSubmit={submit}>
              {!setup && (
                <Field label="Email address">
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </Field>
              )}
              {!recovery && (!setup || validLink) && (
                <>
                  <Field
                    label={setup ? "New password" : "Password"}
                    hint={
                      setup
                        ? "At least 12 characters. Password managers are welcome."
                        : ""
                    }
                  >
                    <div className="ap-password">
                      <input
                        type={visible ? "text" : "password"}
                        autoComplete={
                          setup ? "new-password" : "current-password"
                        }
                        required
                        minLength={setup ? 12 : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setVisible(!visible)}
                        aria-label={visible ? "Hide password" : "Show password"}
                      >
                        {visible ? "Hide" : "Show"}
                      </button>
                    </div>
                  </Field>
                  {setup && (
                    <Field label="Confirm password">
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}
              {!recovery && !setup && (
                <Link className="ap-forgot" to="/admin/forgot-password">
                  Forgot password?
                </Link>
              )}
              {(!setup || validLink) && (
                <button
                  className="ap-button ap-primary ap-full"
                  disabled={busy}
                >
                  {busy
                    ? "Please wait…"
                    : recovery
                      ? "Send reset link"
                      : setup
                        ? "Save password"
                        : "Sign in"}
                  <ArrowRight size={17} />
                </button>
              )}
            </form>
          )}
          {(setup || recovery) && <Link to="/admin">Back to sign in</Link>}
          {setup && !validLink && !busy && (
            <p>
              <Link to="/admin/forgot-password">Request a new link</Link>
            </p>
          )}
          {!setup && !recovery && (
            <div className="ap-auth-help">
              <strong>Need access?</strong>
              <p>
                Ask your owner for an invitation. Setting up your first
                location? Your portal administrator can establish your owner
                account.
              </p>
            </div>
          )}
          <div className="ap-auth-footer">
            Private workspace · Authorized team members only
          </div>
        </div>
      </main>
    </div>
  );
}
