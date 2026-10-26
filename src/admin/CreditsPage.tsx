import { useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { ExportButton, LocationFilter } from "./OperationsUi";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader, Pagination, QueueFilters } from "./ui";
import { dateTime, money } from "./format";
import { useQuery } from "./query";
import type { Credit, Filters } from "./types";
import { portalRole } from "./permissions";
import MachineIssueWorkflow from "./MachineIssueWorkflow";
function CreditDetail({
  credit,
  onClose,
  onSaved,
}: {
  credit: Credit;
  onClose: () => void;
  onSaved: (warning?: string) => void;
}) {
  const { api } = useAdmin();
  const [decision, setDecision] = useState<"approved" | "denied">("approved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.resolveCredit(credit.refund_id, decision, note);
      onSaved(result.notificationWarning);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Loyalty credit R${credit.refund_id}`}
      description="Approval returns value to the customer’s loyalty balance."
      onClose={onClose}
      busy={busy}
    >
      <dl className="ap-detail-grid">
        <div>
          <dt>Customer</dt>
          <dd>{credit.customer_name}</dd>
        </div>
        <div>
          <dt>Requested amount</dt>
          <dd>{money(credit.amount)}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{dateTime(credit.date)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Badge value={credit.status} />
          </dd>
        </div>
      </dl>
      <h3>Customer’s reason</h3>
      <p className="ap-detail-text">{credit.description}</p>
      {credit.status === "pending" ? (
        <form onSubmit={submit}>
          {error && <Notice>{error}</Notice>}
          <Field label="Decision">
            <select
              value={decision}
              onChange={(e) =>
                setDecision(e.target.value as "approved" | "denied")
              }
            >
              <option value="approved">Approve loyalty credit</option>
              <option value="denied">Deny request</option>
            </select>
          </Field>
          <Field label="Note to customer (optional)">
            <textarea
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Notice kind="info">
            {decision === "approved"
              ? `${money(credit.amount)} will be added to the loyalty balance. This does not refund a bank card.`
              : "The customer’s loyalty balance will not change."}
          </Notice>
          <div className="ap-dialog-actions">
            <button
              type="button"
              className="ap-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="ap-button ap-primary" disabled={busy}>
              {busy
                ? "Submitting…"
                : decision === "approved"
                  ? "Approve credit"
                  : "Deny request"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <h3>Resolution</h3>
          <p className="ap-detail-text">
            {credit.admin_note || "No resolution note."}
          </p>
          <p className="ap-muted">
            {credit.resolved_at
              ? dateTime(credit.resolved_at)
              : "Resolution date unavailable"}
          </p>
          {!credit.notification_sent_at && (
            <Notice kind="info">
              The decision is recorded. Customer email delivery has not been
              confirmed.
            </Notice>
          )}
        </>
      )}
    </Modal>
  );
}
function CreditsQueue({ callerId }: { callerId: string }) {
  const { api } = useAdmin();
  const [filters, setFilters] = useState<Filters>({
    status: "pending",
    page: 1,
  });
  const [selected, setSelected] = useState<Credit | null>(null);
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState(false);
  const [locked, setLocked] = useState(false);
  const query = useQuery(
    () => api.credits(filters),
    [api, JSON.stringify(filters)],
  );
  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER CARE"
        title="Loyalty Credits"
        description="Review machine issues, wallet remedies and existing loyalty credit requests."
        action={
          <div className="ap-inline">
            <ExportButton dataset="credits" filters={filters} />
            <button
              className="ap-button"
              onClick={query.reload}
              disabled={query.loading}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        }
      />
      {notice && <Notice kind={warning ? "info" : "success"}>{notice}</Notice>}
      <MachineIssueWorkflow callerId={callerId} selected={selected} onClose={() => setSelected(null)}
        onSaved={query.reload} onLocked={setLocked} legacy={selected && (
        <CreditDetail
          credit={selected}
          onClose={() => setSelected(null)}
          onSaved={(message) => {
            setSelected(null);
            setWarning(Boolean(message));
            setNotice(message ? `Decision saved. ${message}` : "Loyalty credit decision saved.");
            query.reload();
          }}
        />
      )} />
      <section className="ap-panel">
        <QueueFilters filters={filters} onChange={setFilters}>
          <Field label="Status">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value, page: 1 })
              }
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="all">All history</option>
            </select>
          </Field>
          <LocationFilter filters={filters} onChange={setFilters} />
        </QueueFilters>
        {query.loading ? (
          <Loading />
        ) : query.error ? (
          <div className="ap-panel-body">
            <Notice>{query.error}</Notice>
            <button className="ap-button" onClick={query.reload}>
              Retry
            </button>
          </div>
        ) : !query.data?.items.length ? (
          <Empty title="No matching loyalty credit requests">
            Pending requests stay here until reviewed, regardless of age.
          </Empty>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Customer / request</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((credit) => (
                  <tr key={credit.refund_id}>
                    <td>
                      <strong>{credit.customer_name}</strong>
                      <small>R{credit.refund_id}</small>
                    </td>
                    <td className="ap-description">{credit.description}</td>
                    <td className="ap-numeric">{money(credit.amount)}</td>
                    <td>{dateTime(credit.date)}</td>
                    <td>
                      <Badge value={credit.status} />
                    </td>
                    <td>
                      <button
                        className="ap-button"
                        disabled={locked}
                        onClick={() => { setNotice(""); setSelected(credit); }}
                      >
                        {credit.status === "pending"
                          ? "Review"
                          : "View decision"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.data && (
          <Pagination
            page={query.data.page}
            total={query.data.total}
            onChange={(page) => setFilters({ ...filters, page })}
          />
        )}
      </section>
    </>
  );
}

export default function CreditsPage() {
  const { api, identity, loading, error, preview } = useAdmin();
  const key = `${identity?.id ?? ""}:${identity?.role ?? ""}:${identity?.portalRole ?? ""}:${preview}:${loading}:${error}`;
  const [scope, setScope] = useState({ api, key, epoch: 0 });
  if (scope.api !== api || scope.key !== key) {
    setScope({ api, key, epoch: scope.epoch + 1 });
    return null;
  }
  if (loading || error || portalRole(identity) !== "Owner" || !identity) return <Notice>Active Owner access is required.</Notice>;
  return <CreditsQueue key={scope.epoch} callerId={identity.id} />;
}
