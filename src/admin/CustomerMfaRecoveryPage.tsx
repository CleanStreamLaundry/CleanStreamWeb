import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { customerMfaRecoveryApi, CustomerMfaRecoveryError } from "./api";
import { useAdmin } from "./context";
import type { CustomerMfaRecoveryReceipt } from "./types";
import { Field, Modal, Notice, PageHeader } from "./ui";

function RecoveryForm({ ownerId, signOut }: { ownerId: string; signOut: () => Promise<void> }) {
  const [target, setTarget] = useState("");
  const [supportCase, setSupportCase] = useState("");
  const [verified, setVerified] = useState(false);
  const [receipt, setReceipt] = useState<CustomerMfaRecoveryReceipt | null>(null);
  const [attemptedCase, setAttemptedCase] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ target: string; supportCase: string } | null>(null);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);

  const targetId = target.trim().toLowerCase();
  const caseId = supportCase.trim();
  const targetValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(targetId) && targetId !== ownerId.toLowerCase();
  const caseValid = caseId.length > 0 && caseId.length <= 120 && ![...caseId].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  const locked = attemptedCase !== null || (receipt !== null && receipt.state !== "not_started");
  const caseConflict = attemptedCase !== null && receipt?.support_case != null && receipt.support_case !== attemptedCase;
  const canRecover = !busy && !needsSignIn && targetValid && caseValid && verified &&
    receipt?.target_user_id === targetId && receipt.state !== "reenrollment_required" && !caseConflict;

  async function request(action: "inspect" | "recover") {
    if (operation.current || needsSignIn || !targetValid) return;
    if (action === "recover" && (!canRecover || !confirmation || confirmation.target !== targetId || confirmation.supportCase !== caseId)) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setVerified(false);
    if (action === "recover") setAttemptedCase(caseId);
    // Every request invalidates prior inspection; a failed mutation cannot reuse it.
    setReceipt(null);
    const current = () => mounted.current && operation.current === controller && !controller.signal.aborted;
    try {
      const result = action === "inspect"
        ? await customerMfaRecoveryApi.inspect(ownerId, targetId, controller.signal)
        : await customerMfaRecoveryApi.recover(ownerId, targetId, caseId, true, controller.signal);
      if (!current()) return;
      setReceipt(result);
      if (result.support_case && attemptedCase === null) {
        setSupportCase(result.support_case);
        setAttemptedCase(result.support_case);
      }
    } catch (cause) {
      if (!current()) return;
      const failure = cause instanceof CustomerMfaRecoveryError ? cause : new CustomerMfaRecoveryError("recovery_unavailable");
      setError(failure.message);
      if (["session_invalid", "session_changed", "fresh_sign_in_required"].includes(failure.code)) setNeedsSignIn(true);
    } finally {
      if (current()) {
        operation.current = null;
        setBusy(false);
        setConfirmation(null);
      }
    }
  }

  async function leaveSession() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    try { await signOut(); }
    catch {
      if (mounted.current && !controller.signal.aborted) setError("Unable to sign out. Retry sign out before continuing.");
    } finally {
      if (mounted.current && !controller.signal.aborted) {
        operation.current = null;
        setBusy(false);
      }
    }
  }

  return <>
    <PageHeader eyebrow="OWNER" title="Account Recovery" description="Customer authenticator recovery" />
    {error && <Notice>{error}</Notice>}
    {needsSignIn && <button className="ap-button" disabled={busy} onClick={() => void leaveSession()}>Sign out to sign in again</button>}
    <form className="ap-panel-body" onSubmit={(event) => { event.preventDefault(); void request("inspect"); }}>
      <Field label="Customer UUID">
        <input value={target} autoComplete="off" spellCheck={false} disabled={busy || locked || needsSignIn}
          onChange={(event) => {
            setTarget(event.target.value); setReceipt(null); setVerified(false); setConfirmation(null); setError("");
          }} />
      </Field>
      <button className="ap-button" type="submit" disabled={busy || needsSignIn || !targetValid}>
        {busy && !confirmation ? "Inspecting..." : "Inspect customer"}
      </button>
    </form>
    {attemptedCase !== null && !receipt && !needsSignIn && <Notice kind="info">
      The outcome is unconfirmed. Inspect this customer before any deliberate retry of case {attemptedCase}.
    </Notice>}
    {receipt && <section className="ap-panel-body" aria-label="Recovery inspection">
      <dl className="ap-detail-grid">
        <div><dt>Customer UUID</dt><dd className="ap-detail-text">{receipt.target_user_id}</dd></div>
        <div><dt>Recovery state</dt><dd>{receipt.state.replaceAll("_", " ")}</dd></div>
        {receipt.support_case && <div><dt>Support case</dt><dd className="ap-detail-text">{receipt.support_case}</dd></div>}
      </dl>
      {receipt.state === "reenrollment_required" ? <Notice kind="info">
        Original authenticator factors removed. Account recovery is not complete. The customer must sign in again and enroll and verify a new authenticator before access resumes.
      </Notice> : <>
        {caseConflict && <Notice>The recorded case differs from this attempt. Do not start another recovery. Resolve the support case before continuing.</Notice>}
        {receipt.state === "removal_pending" && <Notice kind="info">Original factor removal is pending. Only a deliberate retry of the recorded case is available.</Notice>}
        <Field label="Support case reference" hint="Reference only. No identity documents, passwords or verification codes.">
          <input maxLength={120} autoComplete="off" value={supportCase} disabled={busy || locked || needsSignIn}
            onChange={(event) => { setSupportCase(event.target.value); setVerified(false); setConfirmation(null); }} />
        </Field>
        <Field label="External identity verification">
          <span><input type="checkbox" checked={verified} disabled={busy || needsSignIn || caseConflict}
            onChange={(event) => { setVerified(event.target.checked); setConfirmation(null); }} />{" "}
            I have independently verified the identity of this exact customer UUID outside this portal and recorded it under this support case.
          </span>
        </Field>
        <button className="ap-button ap-primary" disabled={!canRecover}
          onClick={() => { if (canRecover) setConfirmation({ target: targetId, supportCase: caseId }); }}>
          Review MFA recovery
        </button>
      </>}
    </section>}
    {confirmation && <Modal title="Confirm customer MFA recovery" busy={busy} onClose={() => setConfirmation(null)}>
      <dl className="ap-detail-grid">
        <div><dt>Customer UUID</dt><dd className="ap-detail-text">{confirmation.target}</dd></div>
        <div><dt>Support case</dt><dd className="ap-detail-text">{confirmation.supportCase}</dd></div>
      </dl>
      <Notice kind="info">This removes the original authenticator factors and blocks old sessions. It does not complete customer authentication. A new sign-in and authenticator enrollment will be required.</Notice>
      <div className="ap-dialog-actions">
        <button className="ap-button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
        <button className="ap-button ap-primary" disabled={busy || !canRecover} onClick={() => void request("recover")}>
          {busy ? "Recovery pending..." : "Confirm MFA recovery"}
        </button>
      </div>
    </Modal>}
  </>;
}

export default function CustomerMfaRecoveryPage() {
  const { api, identity, preview, loading, signOut } = useAdmin();
  const location = useLocation();
  const key = JSON.stringify([identity?.id, identity?.role, preview, loading, location.key, location.pathname, location.search, location.hash]);
  const [scope, setScope] = useState({ api, key, epoch: 0 });
  if (scope.api !== api || scope.key !== key) {
    setScope({ api, key, epoch: scope.epoch + 1 });
    return null;
  }
  if (loading || !identity || identity.role !== "Owner") return <Notice>Current Owner access is required.</Notice>;
  if (preview) return <Notice kind="info">Customer recovery is unavailable in preview.</Notice>;
  return <RecoveryForm key={scope.epoch} ownerId={identity.id} signOut={signOut} />;
}
