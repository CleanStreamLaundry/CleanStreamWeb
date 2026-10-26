import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAdmin } from "./context";
import { AdminAdmissionError } from "./admission";
import { money } from "./format";
import { machineIssueResolutions, machineIssueUuid } from "./machineIssueContract";
import { Badge, Field, Loading, Modal, Notice } from "./ui";
import type { AdminApi, Credit, MachineIssueResolutionInput, MachineIssueReview } from "./types";

type Pending = Pick<MachineIssueResolutionInput, "id" | "requestId" | "resolution">;
const pendingKey = (callerId: string) => `admin.machine-issue.pending.${callerId}`;
function readPending(callerId: string): { pending: Pending | null; error: string } {
  try {
    const raw = sessionStorage.getItem(pendingKey(callerId));
    if (raw === null) return { pending: null, error: "" };
    const p = JSON.parse(raw) as Pending;
    if (!p || !Number.isSafeInteger(p.id) || p.id <= 0 || typeof p.requestId !== "string" ||
      !machineIssueUuid.test(p.requestId) || !machineIssueResolutions.includes(p.resolution)) throw new Error("Invalid reference");
    return { pending: { id: p.id, requestId: p.requestId, resolution: p.resolution }, error: "" };
  } catch {
    return { pending: null, error: "The local machine issue request record is unavailable. Reconcile it before submitting another resolution." };
  }
}

function IssueForm({ review, disabled, onSubmit }: {
  review: MachineIssueReview; disabled: boolean; onSubmit: (input: Omit<MachineIssueResolutionInput, "requestId">) => void;
}) {
  const [atLocation, setAtLocation] = useState(false);
  const [anotherLoad, setAnotherLoad] = useState<"" | "yes" | "no">("");
  const [resolution, setResolution] = useState<MachineIssueResolutionInput["resolution"]>("manual_review");
  const [machineId, setMachineId] = useState("");
  const [note, setNote] = useState("");
  const financialAllowed = review.status === "pending" && review.sameDayEligible &&
    review.amountCents !== null && review.amountCents > 0 && review.paidAmountCents !== null &&
    review.promoAmountCents !== null && review.locationId !== null && !review.financialResolution;
  const walletAllowed = financialAllowed && review.capabilities.walletRefund && atLocation && anotherLoad === "yes";
  const replacementAllowed = financialAllowed && review.capabilities.replacementVend && atLocation && anotherLoad === "no" && review.replacementMachines.length > 0;
  const selectedMachine = review.replacementMachines.find(m => String(m.id) === machineId);
  const valid = !disabled && !review.financialResolution && review.status === "pending" && note.trim().length > 0 &&
    (resolution === "manual_review" || (resolution === "wallet_refund" ? walletAllowed : replacementAllowed && Boolean(selectedMachine)));
  function resetDecision() { setResolution("manual_review"); setMachineId(""); }
  return <>
    <dl className="ap-detail-grid">
      <div><dt>Transaction</dt><dd>{review.transactionId}</dd></div>
      <div><dt>Server transaction amount</dt><dd>{review.amountCents === null ? "Unverified" : money(review.amountCents / 100)}</dd></div>
      <div><dt>Original paid value</dt><dd>{review.paidAmountCents === null ? "Unverified" : money(review.paidAmountCents / 100)}</dd></div>
      <div><dt>Original promotional value</dt><dd>{review.promoAmountCents === null ? "Unverified" : money(review.promoAmountCents / 100)}</dd></div>
      <div><dt>Original location ID</dt><dd>{review.locationId ?? "Unverified"}</dd></div>
      <div><dt>Recorded location timezone</dt><dd>{review.locationTimezone ?? "Unverified"}</dd></div>
      <div><dt>Transaction timestamp</dt><dd>{review.transactionAt ?? "Unverified"}</dd></div>
      <div><dt>Request received</dt><dd>{review.receivedAt}</dd></div>
    </dl>
    <Badge value={review.status} />
    <Notice kind="info">{review.sameDayEligible ? "Server records confirm the same-day window." : "Same-day eligibility is not confirmed. No automatic financial remedy is available."}</Notice>
    {review.manualReviewReason && <Notice kind="info">{review.manualReviewReason}</Notice>}
    {review.financialResolution ? <Notice kind="info">{review.financialResolution.state === "completed"
      ? review.financialResolution.kind === "wallet_refund" ? "Wallet refund confirmed, preserving original paid and promotional value." : "Replacement machine start confirmed by the server."
      : "A financial resolution is already pending or requires support. Do not submit another refund or machine start."}</Notice>
      : review.status === "pending" && <form onSubmit={event => {
        event.preventDefault();
        if (!valid) return;
        onSubmit({ id: review.refundId, resolution, note: note.trim(), atLocation, anotherLoadCompleted: anotherLoad === "yes",
          ...(resolution === "replacement_vend" && selectedMachine ? { replacementMachineId: selectedMachine.id } : {}) });
      }}>
        <fieldset disabled={disabled}>
          <legend>Owner attestations (not app-verified)</legend>
          <label className="ap-field"><span><input type="checkbox" checked={atLocation} onChange={event => { setAtLocation(event.target.checked); resetDecision(); }} /> Customer notified us while at the original location</span></label>
          <Field label="Has the customer already completed another load? (Owner attestation)">
            <select value={anotherLoad} onChange={event => { setAnotherLoad(event.target.value as typeof anotherLoad); resetDecision(); }}>
              <option value="">Not confirmed</option><option value="yes">Yes, another load completed</option><option value="no">No, another load has not completed</option>
            </select>
          </Field>
          <Field label="Resolution"><select value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)}>
            <option value="manual_review">Record manual review</option>
            <option value="wallet_refund" disabled={!walletAllowed}>Refund original wallet value</option>
            <option value="replacement_vend" disabled={!replacementAllowed}>Start a same-price replacement</option>
          </select></Field>
          {resolution === "replacement_vend" && <Field label="Replacement machine"><select required value={machineId} onChange={event => setMachineId(event.target.value)}>
            <option value="">Select available machine</option>
            {review.replacementMachines.map(machine => <option key={machine.id} value={machine.id}>{machine.name} (#{machine.id}) - {money(machine.amountCents / 100)}</option>)}
          </select></Field>}
          {review.replacementUnavailableReason && <Notice kind="info">{review.replacementUnavailableReason}</Notice>}
          <Field label="Resolution note"><textarea required maxLength={4000} value={note} onChange={event => setNote(event.target.value)} /></Field>
          <Notice kind="info">{resolution === "wallet_refund"
            ? "Returns the original paid and promotional amounts to the wallet, not to a bank card."
            : resolution === "replacement_vend"
              ? "This requests a real sponsored machine start. No additional customer payment is collected. A pending response is not confirmation that the machine started."
              : "Records the note and Owner attestations for follow-up. No money is returned, no machine is started, and the claim remains pending."}</Notice>
          <div className="ap-dialog-actions"><button className="ap-button ap-primary" disabled={!valid}>
            {resolution === "wallet_refund" ? "Confirm wallet refund" : resolution === "replacement_vend" ? "Request replacement start" : "Record manual review"}
          </button></div>
        </fieldset>
      </form>}
  </>;
}

function Inspect({ credit, callerId, api, preview, legacy, onClose, onSubmit }: {
  credit: Credit; callerId: string; api: AdminApi; preview: boolean; legacy: ReactNode;
  onClose: () => void; onSubmit: (input: Omit<MachineIssueResolutionInput, "requestId">) => void;
}) {
  const [review, setReview] = useState<MachineIssueReview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api.machineIssueReview(callerId, credit.refund_id, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) setReview(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError("The server review is unavailable. No resolution was submitted.");
    });
    return () => controller.abort();
  }, [api, callerId, credit.refund_id, attempt]);
  if (review?.policyVersion === "legacy_14_day") return legacy;
  return <Modal title={`Machine issue R${credit.refund_id}`} description={credit.customer_name} onClose={onClose} wide>
    <p className="ap-detail-text">{credit.description}</p>
    {preview && <Notice kind="info">Synthetic preview. Machine starts and wallet refunds are unavailable.</Notice>}
    {error ? <><Notice>{error}</Notice><button className="ap-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry review</button></>
      : review ? <IssueForm review={review} disabled={preview} onSubmit={onSubmit} /> : <Loading />}
  </Modal>;
}

export default function MachineIssueWorkflow({ callerId, selected, legacy, onClose, onSaved, onLocked }: {
  callerId: string; selected: Credit | null; legacy: ReactNode; onClose: () => void;
  onSaved: () => void; onLocked: (locked: boolean) => void;
}) {
  const { api, preview, refresh } = useAdmin();
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

  function accept(review: MachineIssueReview, record: Pending) {
    const receipt = review.receipt;
    if (review.refundId !== record.id || !receipt || receipt.requestId !== record.requestId || receipt.resolution !== record.resolution) {
      setError("No matching receipt is confirmed. This does not mean it is safe to retry. Keep the request ID for reconciliation.");
      return;
    }
    if (receipt.state === "pending" || receipt.state === "support_required") {
      setError(receipt.state === "pending" ? "Resolution is pending. No completed refund or machine start is confirmed. Check request status; do not repeat the action."
        : "Resolution requires support. No completed refund or machine start is confirmed. Keep this request ID; do not submit another remedy.");
      return;
    }
    if (record.resolution === "manual_review" ? receipt.state !== "recorded"
      : receipt.state !== "completed" || review.financialResolution?.kind !== record.resolution ||
        review.financialResolution.state !== "completed" || review.financialResolution.requestId !== record.requestId) {
      setError("The resolution outcome could not be confirmed. Check request status before taking further action.");
      return;
    }
    try { sessionStorage.removeItem(pendingKey(callerId)); }
    catch { setStorageError("The local request record could not be cleared. Check this request again before another resolution."); return; }
    setPending(null); setStorageError(""); setError("");
    setNotice(record.resolution === "manual_review" ? "Manual review recorded. The claim remains pending; no money was returned and no machine was started."
      : record.resolution === "wallet_refund" ? "Wallet refund confirmed. Original paid and promotional value was restored."
        : "Replacement machine start confirmed by the server.");
    onSaved();
  }

  async function submit(input: Omit<MachineIssueResolutionInput, "requestId">) {
    if (preview || operation.current || pending || storageError || input.id !== selected?.refund_id) return;
    const record: Pending = { id: input.id, resolution: input.resolution, requestId: crypto.randomUUID() };
    // Persist identifiers only, before dispatch. Neither notes nor credentials belong in the journal.
    try { sessionStorage.setItem(pendingKey(callerId), JSON.stringify(record)); }
    catch { setStorageError("Cannot preserve the request for reconciliation. No resolution was submitted."); return; }
    const controller = new AbortController();
    operation.current = controller; setPending(record); setBusy(true); setError(""); setNotice(""); onClose();
    try {
      const result = await api.resolveMachineIssue(callerId, { ...input, requestId: record.requestId }, controller.signal);
      if (mounted.current && !controller.signal.aborted) accept(result.review, record);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError("Resolution outcome is unconfirmed. Check request status; do not repeat the action.");
      if (cause instanceof AdminAdmissionError) void refresh();
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  async function checkStatus() {
    if (preview || operation.current || !pending) return;
    const controller = new AbortController();
    operation.current = controller; setBusy(true); setError("");
    try {
      const review = await api.machineIssueReview(callerId, pending.id, pending.requestId, controller.signal);
      if (mounted.current && !controller.signal.aborted) accept(review, pending);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError("Request status is unavailable. Do not submit another resolution.");
      if (cause instanceof AdminAdmissionError) void refresh();
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  return <>
    {notice && <Notice kind="info">{notice}</Notice>}
    {storageError && <Notice>{storageError}</Notice>}
    {error && <Notice>{error}</Notice>}
    {pending && <section className="ap-panel-body" aria-label="Machine issue request recovery">
      <p>Unconfirmed request for R{pending.id}: {pending.requestId}</p>
      <p className="ap-muted">Recovery is saved in this tab only. Keep this request ID until confirmed; do not repeat the action in another tab.</p>
      <button className="ap-button" disabled={busy || preview} onClick={() => void checkStatus()}>Check machine issue status</button>
    </section>}
    {selected && !pending && !storageError && !busy && <Inspect key={selected.refund_id} credit={selected} callerId={callerId} api={api}
      preview={preview} legacy={legacy} onClose={onClose} onSubmit={input => void submit(input)} />}
  </>;
}
