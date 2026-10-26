import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader } from "./ui";
import { dateTime, money } from "./format";
import { useQuery } from "./query";
import type { AdminApi, TopupRefund, TopupRefundAction, TopupRefundCursor } from "./types";

function outcome(r: TopupRefund): string {
  if (r.status === "succeeded" && r.completed_at) return "Stripe refund confirmed. Bank posting may take longer.";
  if (r.status === "denied") return "Request denied. The wallet reservation was released.";
  if (r.status === "failed" || r.status === "canceled") return "Payout did not complete. The wallet reservation was released.";
  if (r.status === "requested") return "Awaiting Owner review. Principal and required promo value are reserved; no payout is confirmed.";
  return "Payout is not confirmed. Funds remain reserved. Reconcile the existing request; do not create another payout or release the reservation manually.";
}

function Review({ record, api, ownerId, onClose, onSettled }: {
  record: TopupRefund; api: AdminApi; ownerId: string; onClose: () => void;
  onSettled: (message: string, failed: boolean) => void;
}) {
  const [action, setAction] = useState<TopupRefundAction>(record.status === "requested" ? "approve" : "reconcile");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const actionable = ["requested", "approved", "pending", "unknown"].includes(record.status);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (inFlight.current || !actionable || !signal || signal.aborted) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await api.reviewTopupRefund(ownerId, record.id, action, note, signal);
      if (!signal.aborted) onSettled(outcome(result), false);
    } catch (error) {
      if (!signal.aborted) onSettled(error instanceof Error ? error.message : "Outcome unconfirmed. Refresh request history before taking action.", true);
    }
    // The dialog closes and the list is re-read on either outcome. No local
    // amount/status mutation and no automatic payout retry after uncertainty.
  };
  return <Modal title="Review top-up refund" description={`Request ${record.id}`} onClose={onClose} busy={busy} wide>
    <dl className="ap-detail-grid">
      {[
        ["Customer ID", record.customer_id], ["Load ID", record.load_id],
        ["Full paid principal", money(record.principal_cents / 100)],
        ["Promo reserved (not cash)", money(record.bonus_reserved_cents / 100)],
        ["Requested", dateTime(record.requested_at)], ["Payment succeeded", dateTime(record.payment_succeeded_at)],
        ["Location ID", record.location_id ?? "Global wallet funding"], ["Policy", record.policy_version],
        ["Reviewed", record.reviewed_at ? dateTime(record.reviewed_at) : "Not reviewed"],
        ["Completed", record.status === "succeeded" && record.completed_at ? dateTime(record.completed_at) : "Not confirmed"],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <Badge value={record.status} />
    <Notice kind="info">{outcome(record)}</Notice>
    {record.review_note && <p className="ap-detail-text">{record.review_note}</p>}
    {actionable && <form onSubmit={submit}>
      {record.status === "requested" && <Field label="Decision">
        <select value={action} disabled={busy} onChange={(e) => setAction(e.target.value as TopupRefundAction)}>
          <option value="approve">Approve original-payment refund</option>
          <option value="deny">Deny and release reservation</option>
        </select>
      </Field>}
      <Field label="Review note (optional)"><textarea value={note} maxLength={2000} disabled={busy} onChange={(e) => setNote(e.target.value)} /></Field>
      <Notice kind="info">{action === "approve" ? `${money(record.principal_cents / 100)} to the original payment method. No fee deduction and no cash value for promo credit. Approval alone is not payout confirmation.` : action === "deny" ? "Denial releases reserved wallet value. No original-payment refund will be initiated." : "Reconciliation checks provider state and may submit the existing approved refund within the backend's idempotent retry window. It is not a new refund request."}</Notice>
      <div className="ap-dialog-actions">
        <button type="button" className="ap-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="ap-button ap-primary" disabled={busy}>{busy ? "Submitting..." : action === "approve" ? "Approve refund" : action === "deny" ? "Deny request" : "Reconcile refund"}</button>
      </div>
    </form>}
  </Modal>;
}

function Queue({ api, ownerId }: { api: AdminApi; ownerId: string }) {
  const [cursors, setCursors] = useState<(TopupRefundCursor | null)[]>([null]);
  const [selected, setSelected] = useState<TopupRefund | null>(null);
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery(() => api.topupRefunds(ownerId, cursor), [api, ownerId, JSON.stringify(cursor)]);
  const last = query.data?.at(-1);
  const refresh = () => { setCursors([null]); query.reload(); };
  return <>
    <PageHeader title="Top-Up Refunds" eyebrow="OWNER REVIEW" description="Original-payment refunds for unused wallet funding. Separate from Loyalty Credits."
      action={<button className="ap-button" disabled={query.loading || Boolean(selected)} onClick={refresh}><RefreshCw size={16} />Refresh</button>} />
    <Notice kind="info">Active Owner access and verified MFA are required by the server. Requested, pending and unknown refunds keep wallet value reserved until a verified resolution.</Notice>
    {notice && <Notice kind={notice.failed ? "error" : "info"}>{notice.message}</Notice>}
    <section className="ap-panel">
      {query.loading ? <Loading /> : query.error ? <div className="ap-panel-body"><Notice>{query.error}</Notice><button className="ap-button" onClick={query.reload}>Retry history</button></div>
        : !query.data?.length ? <Empty title="No top-up refund requests" /> : <div className="ap-table-wrap"><table className="ap-table">
          <thead><tr><th>Customer / request</th><th>Load</th><th>Principal</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{query.data.map((r) => <tr key={r.id}>
            <td><strong>{r.customer_id}</strong><small>{r.id}</small></td><td>{r.load_id}</td>
            <td className="ap-numeric">{money(r.principal_cents / 100)}</td><td>{dateTime(r.requested_at)}</td><td><Badge value={r.status} /></td>
            <td><button className="ap-button" onClick={() => { setSelected(r); setNotice(null); }}>Review</button></td>
          </tr>)}</tbody>
        </table></div>}
      <div className="ap-pagination"><span>Page {cursors.length}</span><div>
        <button aria-label="Previous page" disabled={query.loading || cursors.length === 1 || Boolean(selected)} onClick={() => setCursors((v) => v.slice(0, -1))}><ChevronLeft size={16} /></button>
        <button aria-label="Next page" disabled={query.loading || query.data?.length !== 100 || !last || Boolean(selected)} onClick={() => { if (last) setCursors((v) => [...v, { before: last.requested_at, before_id: last.id }]); }}><ChevronRight size={16} /></button>
      </div></div>
    </section>
    {selected && <Review key={selected.id} record={selected} api={api} ownerId={ownerId} onClose={() => setSelected(null)} onSettled={(message, failed) => {
      setSelected(null); setNotice({ message, failed }); query.reload();
    }} />}
  </>;
}

export default function TopupRefundsPage() {
  const { api, identity } = useAdmin();
  const key = `${identity?.id ?? ""}:${identity?.role ?? ""}`;
  const [scope, setScope] = useState({ api, key, epoch: 0 });
  if (scope.api !== api || scope.key !== key) {
    setScope({ api, key, epoch: scope.epoch + 1 });
    return null;
  }
  if (identity?.role !== "Owner") return <Notice>Owner access required.</Notice>;
  return <Queue key={scope.epoch} api={api} ownerId={identity.id} />;
}
