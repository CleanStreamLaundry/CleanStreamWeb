import { useEffect, useRef, useState } from "react";
import { staffRoleApi } from "./api";
import { AdminAdmissionError } from "./admission";
import { useAdmin } from "./context";
import { portalRole as identityPortalRole } from "./permissions";
import type { Member, StaffRole, StaffRoleChange, StaffRoleReceipt } from "./types";
import { Field, Modal, Notice } from "./ui";

type PendingChange = Pick<StaffRoleChange, "userId" | "portalRole" | "requestId">;
const pendingKey = (callerId: string) => `admin.staff-role.pending.${callerId}`;

function memberPortalRole(member: Member) {
  if (member.role === "Owner") return "Owner";
  return member.portal_role ?? (member.role === "Admin" ? "Manager" : member.role);
}

function readPending(callerId: string): { pending: PendingChange | null; error: string } {
  try {
    const raw = sessionStorage.getItem(pendingKey(callerId));
    if (raw === null) return { pending: null, error: "" };
    const value = JSON.parse(raw) as Partial<PendingChange>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!value || typeof value.userId !== "string" || !uuid.test(value.userId) ||
      typeof value.requestId !== "string" || !uuid.test(value.requestId) ||
      (value.portalRole !== "Manager" && value.portalRole !== "Maintenance")) throw new Error("Invalid receipt");
    return { pending: { userId: value.userId, portalRole: value.portalRole, requestId: value.requestId }, error: "" };
  } catch {
    return { pending: null, error: "The local access request record is unavailable. Reconcile it before changing access." };
  }
}

function RoleConfirmation({ member, onClose, onConfirm }: {
  member: Member; onClose: () => void; onConfirm: (portalRole: StaffRole, note: string) => void;
}) {
  const currentRole = memberPortalRole(member);
  const [portalRole, setPortalRole] = useState<StaffRole>(currentRole === "Manager" ? "Maintenance" : "Manager");
  const [note, setNote] = useState("");
  return <Modal title="Change access?" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onConfirm(portalRole, note.trim()); }}>
      <p><strong>{member.name || member.email}</strong></p>
      <p className="ap-detail-text">{member.email}<br />{member.user_id}</p>
      <p>Current access: {currentRole}</p>
      <Field label="New access"><select value={portalRole} onChange={event => setPortalRole(event.target.value as StaffRole)}>
        <option value="Manager">Manager</option><option value="Maintenance">Maintenance</option>
      </select></Field>
      <Notice kind="info">{portalRole === "Manager"
        ? "Manager access includes nonfinancial operations at assigned locations. Financial and team administration remain Owner-only."
        : "Maintenance access is limited to maintenance at assigned locations."} This change applies to all existing location assignments; assignments are preserved.</Notice>
      <Field label="Reason"><textarea required maxLength={4000} value={note} onChange={event => setNote(event.target.value)} /></Field>
      <div className="ap-dialog-actions">
        <button type="button" className="ap-button" onClick={onClose}>Cancel</button>
        <button className="ap-button ap-primary" disabled={!note.trim() || portalRole === currentRole}>Confirm access change</button>
      </div>
    </form>
  </Modal>;
}

export default function StaffRoleForm({ callerId, member, onClose, onChanged, onLocked }: {
  callerId: string; member: Member | null; onClose: () => void; onChanged: () => void; onLocked: (locked: boolean) => void;
}) {
  const { identity, preview, loading, error: admissionError, refresh } = useAdmin();
  const allowed = !preview && !loading && !admissionError && identity?.id === callerId &&
    identityPortalRole(identity) === "Owner";
  const [recovery] = useState(() => readPending(callerId));
  const [pending, setPending] = useState(recovery.pending);
  const [storageError, setStorageError] = useState(recovery.error);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);
  useEffect(() => { onLocked(Boolean(pending || storageError || busy)); }, [pending, storageError, busy, onLocked]);
  useEffect(() => { if (!allowed) operation.current?.abort(); }, [allowed]);

  function completed(receipt: StaffRoleReceipt, record: PendingChange) {
    if (receipt.userId !== record.userId || receipt.portalRole !== record.portalRole || receipt.requestId !== record.requestId) {
      setError("No matching completed change is confirmed. Do not submit another change; check request status.");
      return;
    }
    try { sessionStorage.removeItem(pendingKey(callerId)); }
    catch {
      setStorageError("The local access request record could not be cleared. Check this request again before changing access.");
      return;
    }
    setPending(null); setStorageError(""); setError("");
    setNotice(`Access change confirmed. Account ${receipt.userId} now has ${receipt.portalRole} access.`);
    onClose(); onChanged();
  }

  async function change(portalRole: StaffRole, note: string) {
    const expectedPortalRole = member && memberPortalRole(member);
    if (!allowed || operation.current || pending || storageError || !member || member.user_id === callerId ||
      (expectedPortalRole !== "Manager" && expectedPortalRole !== "Maintenance") ||
      (portalRole !== "Manager" && portalRole !== "Maintenance") || portalRole === expectedPortalRole || !note || note.length > 4000) return;
    const record: PendingChange = { userId: member.user_id, portalRole, requestId: crypto.randomUUID() };
    // The tab-scoped journal contains identifiers only, never the reason or account details.
    try { sessionStorage.setItem(pendingKey(callerId), JSON.stringify(record)); }
    catch { setStorageError("Cannot preserve the access request for reconciliation. No change was submitted."); return; }
    const controller = new AbortController();
    operation.current = controller;
    setPending(record); setBusy(true); setError(""); setNotice(""); onClose();
    try {
      const receipt = await staffRoleApi.setRole(callerId, { ...record, expectedPortalRole, note }, controller.signal);
      if (mounted.current && !controller.signal.aborted) completed(receipt, record);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError("Access change outcome is unconfirmed. Check request status; do not submit another change.");
      if (cause instanceof AdminAdmissionError) void refresh();
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  async function checkStatus() {
    if (!allowed || operation.current || !pending) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError("");
    try {
      const result = await staffRoleApi.status(callerId, pending.requestId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.state === "completed") completed(result.result, pending);
      else setError("No completed change is confirmed. This does not mean it is safe to retry. Keep this request ID for reconciliation.");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError("Access change status is unavailable. Do not submit another change.");
      if (cause instanceof AdminAdmissionError) void refresh();
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  if (!allowed) return null;
  return <>
    {notice && <Notice kind="info">{notice}</Notice>}
    {storageError && <Notice>{storageError}</Notice>}
    {error && <Notice>{error}</Notice>}
    {pending && <section className="ap-panel-body" aria-label="Access request recovery">
      <p className="ap-detail-text">Unconfirmed access request: {pending.requestId}</p>
      <p className="ap-muted">Recovery is saved in this tab only. Keep this request ID until the outcome is confirmed; do not repeat the change in another tab.</p>
      <button className="ap-button" disabled={busy} onClick={() => void checkStatus()}>Check access request status</button>
    </section>}
    {member && member.user_id !== callerId && ["Manager", "Maintenance"].includes(memberPortalRole(member)) && !pending && !storageError && !busy &&
      <RoleConfirmation key={`${member.user_id}:${memberPortalRole(member)}`} member={member} onClose={onClose}
        onConfirm={(portalRole, note) => void change(portalRole, note)} />}
  </>;
}
