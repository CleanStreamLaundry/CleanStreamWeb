import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import QRCode from "qrcode";
import { getSupabaseClient } from "../supabase/client";
import type { StaffMfaAdmission } from "./admission";
import { staffMfaAttempt, type TotpEnrollment, type TotpFactor } from "./mfa";
import { Field, Notice } from "./ui";

interface Props {
  admission: StaffMfaAdmission;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
function StaffMfaForm({ admission, refresh, signOut }: Props) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<ReturnType<typeof staffMfaAttempt> | null>(null);
  const inFlight = useRef(false);
  const loadFactors = useCallback(async (run: ReturnType<typeof staffMfaAttempt>) => {
    const next = await run.factors();
    if (!run.current()) return;
    setFactors(next);
    setFactorId(next[0]?.id ?? "");
    setSupported(run.supported());
    setReady(true);
  }, []);
  useEffect(() => {
    const href = window.location.href;
    const run = staffMfaAttempt(getSupabaseClient(), admission.session,
      () => window.location.href === href,
      { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_ANON_KEY });
    attempt.current = run;
    queueMicrotask(() => {
      if (!run.current()) return;
      void loadFactors(run).catch(() => {
        if (run.current()) setError("Unable to load your authenticators. Retry the access check or sign in again.");
      });
    });
    return () => { run.close(); if (attempt.current === run) attempt.current = null; };
  }, [admission, loadFactors]);
  const runAction = async (action: (run: ReturnType<typeof staffMfaAttempt>) => Promise<void>) => {
    const run = attempt.current;
    if (!run?.current() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try { await action(run); }
    catch (failure) {
      if (run.current()) setError(failure instanceof Error ? failure.message : "Unable to complete verification.");
    } finally {
      if (run.current()) { inFlight.current = false; setBusy(false); }
    }
  };
  const enroll = () => runAction(async (run) => {
    const next = await run.enroll();
    if (!run.current()) return;
    // Enrollment already exists remotely; keep manual setup usable if local QR
    // generation fails instead of creating another factor on the next attempt.
    setEnrollment(next);
    setFactorId(next.id);
    // Generate a local bitmap from the OTP URI, never render server SVG markup.
    let image: string;
    try { image = await QRCode.toDataURL(next.uri, { width: 240, margin: 2 }); }
    catch (cause) {
      throw new Error("Unable to generate the QR code. Enter the setup key in your authenticator, then verify a code.", { cause });
    }
    if (!run.current()) return;
    setQr(image);
  });
  const verify = (event: FormEvent) => {
    event.preventDefault();
    void runAction(async (run) => {
      await run.verify(factorId, code);
      if (!run.current()) return;
      setCode(""); setEnrollment(null); setQr("");
      await refresh();
    });
  };
  const leave = () => {
    const run = attempt.current;
    void signOut().catch(() => {
      if (run?.current()) setError("Unable to sign out. Please try again.");
    });
  };
  return <div className="admin-portal ap-access">
    <h1>{admission.step === "enroll_totp" ? "Set up your authenticator" : "Verify your authenticator"}</h1>
    {error && <Notice>{error}</Notice>}
    {ready && !supported && <Notice>This portal version or browser cannot safely complete authenticator verification. Use an approved compatible browser or contact your portal administrator.</Notice>}
    {ready && supported && !factorId && admission.step === "enroll_totp" &&
      <button className="ap-button ap-primary" disabled={busy} onClick={() => void enroll()}>Set up authenticator</button>}
    {ready && !factorId && admission.step === "challenge_totp" &&
      <Notice>No verified authenticator is available. Contact your portal administrator for account recovery.</Notice>}
    {enrollment && <>
      {qr && <img src={qr} alt="Authenticator setup QR code" width={240} height={240} />}
      <Field label="Setup key"><input value={enrollment.secret} readOnly autoComplete="off" spellCheck={false} /></Field>
    </>}
    {ready && supported && factorId && <form onSubmit={verify}>
      {factors.length > 1 && <Field label="Authenticator"><select value={factorId} disabled={busy} onChange={(event) => { setFactorId(event.target.value); setCode(""); }}>
        {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}
      </select></Field>}
      <Field label="Authenticator code"><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
      <button className="ap-button ap-primary" disabled={busy || code.length !== 6}>{busy ? "Verifying..." : "Verify"}</button>
    </form>}
    <button className="ap-button" disabled={busy} onClick={() => void runAction(async (run) => {
      await refresh();
      if (!ready && run.current()) await loadFactors(run);
    })}>Retry access check</button>
    <button className="ap-button" onClick={leave}>Sign out</button>
    <Link to="/support">Account recovery support</Link>
  </div>;
}
export default function StaffMfaBoundary({ children, ...props }: Props & { children: ReactNode }) {
  const location = useLocation();
  // Password recovery/setup remains usable without granting workspace access.
  if (["forgot-password", "reset-password", "accept-invite"].some((path) => location.pathname === `/admin/${path}`)) return children;
  return <StaffMfaForm key={`${location.key}:${props.admission.session.access_token}`} {...props} />;
}
