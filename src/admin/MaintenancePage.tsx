import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Image, RefreshCw } from "lucide-react";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader, Pagination, QueueFilters } from "./ui";
import { dateTime } from "./format";
import { useQuery } from "./query";
import { ChangeDetails, ExportButton, LocationFilter } from "./OperationsUi";
import { maintenanceAttachmentAttempt } from "./maintenanceAttachment";
import type {
  Filters,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenancePriority,
} from "./types";

function MaintenanceAttachment({ maintId, callerId }: { maintId: string; callerId: string }) {
  const attempt = useRef<ReturnType<typeof maintenanceAttachmentAttempt> | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revoke = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  useEffect(() => () => {
    attempt.current?.close();
    attempt.current = null;
    revoke();
  }, []);
  const load = async () => {
    if (busy) return;
    attempt.current?.close();
    revoke();
    setUrl(null);
    setError("");
    setBusy(true);
    let run: ReturnType<typeof maintenanceAttachmentAttempt> | null = null;
    try {
      run = maintenanceAttachmentAttempt(maintId, callerId, () => {
        revoke();
        setUrl(null);
        setBusy(false);
        setError("Your session changed. Reopen the report before viewing its attachment.");
      });
      attempt.current = run;
      const blob = await run.download();
      if (attempt.current !== run || !run.current()) return;
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
    } catch (failure) {
      if (!run || (attempt.current === run && run.current())) {
        setError(failure instanceof Error ? failure.message : "Unable to load this attachment.");
      }
    } finally {
      if (!run || (attempt.current === run && run.current())) setBusy(false);
    }
  };
  return <div>
    {error && <Notice>{error}</Notice>}
    {url ? <>
      <img className="ap-attachment" src={url} alt="Attached maintenance report evidence" />
      <a className="ap-button" href={url} download={`maintenance-${maintId}`}>
        <Download size={16} /> Download attachment
      </a>
    </> : <button type="button" className="ap-button" onClick={() => { void load(); }} disabled={busy}>
      <Image size={16} /> {busy ? "Loading attachment..." : error ? "Retry attachment" : "View attachment"}
    </button>}
  </div>;
}

function MaintenanceDetail({
  item,
  onClose,
  onSaved,
}: {
  item: MaintenanceRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, identity } = useAdmin();
  const history = useQuery(
    () => api.history(item.maint_id),
    [api, item.maint_id],
  );
  const [status, setStatus] = useState<MaintenanceStatus>(item.status);
  const [priority, setPriority] = useState<MaintenancePriority>(
    item.priority ?? "normal",
  );
  const [assignedTo, setAssignedTo] = useState(item.assigned_to ?? "");
  const [dueDate, setDueDate] = useState(item.due_date ?? "");
  const assignees = useQuery(
    () => api.assignees(item.maint_id),
    [api, item.maint_id],
  );
  const changed =
    status !== item.status ||
    priority !== (item.priority ?? "normal") ||
    assignedTo !== (item.assigned_to ?? "") ||
    dueDate !== (item.due_date ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateMaintenance(
        item.maint_id,
        status,
        note,
        item.updated_at,
        { priority, assignedTo: assignedTo || null, dueDate: dueDate || null },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Maintenance report"
      description={`Report ${item.maint_id} · ${item.location || "Unassigned location"}`}
      onClose={onClose}
      busy={busy}
      wide
    >
      <dl className="ap-detail-grid">
        <div>
          <dt>Submitted</dt>
          <dd>{dateTime(item.created_at)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{item.category}</dd>
        </div>
      </dl>
      <p className="ap-detail-text">{item.description}</p>
      {identity && <MaintenanceAttachment key={`${identity.id}:${item.maint_id}`} maintId={item.maint_id} callerId={identity.id} />}
      <form onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        <div className="ap-form-grid">
          <Field label="Work status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as MaintenancePriority)
              }
            >
              {["low", "normal", "high", "urgent"].map((value) => (
                <option key={value} value={value}>
                  {value[0]!.toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Assigned to"
            hint="Only team members with access to this location can be assigned."
          >
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              disabled={assignees.loading || !!assignees.error}
            >
              <option value="">Unassigned</option>
              {assignedTo &&
                !assignees.data?.some((a) => a.id === assignedTo) && (
                  <option value={assignedTo}>
                    {item.assigned_name ?? "Previous assignee"} (access needs
                    review)
                  </option>
                )}
              {assignees.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date" hint="America/Indiana/Indianapolis">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        {assignees.error && (
          <Notice>
            {assignees.error}{" "}
            <button
              type="button"
              className="ap-text-button"
              onClick={assignees.reload}
            >
              Retry team list
            </button>
          </Notice>
        )}
        <Field
          label="Internal note"
          hint="Visible to authorized team members, not sent to the customer."
        >
          <textarea
            value={note}
            maxLength={4000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add progress, repair details, or a resolution note…"
          />
        </Field>
        <h3>Activity history</h3>
        {history.loading ? (
          <Loading />
        ) : history.error ? (
          <Notice>{history.error}</Notice>
        ) : (
          <ol className="ap-history">
            {history.data?.length ? (
              history.data.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.actor_name}</strong> ·{" "}
                  {entry.from_status.replaceAll("_", " ")} →{" "}
                  {entry.to_status.replaceAll("_", " ")}
                  <small>{dateTime(entry.created_at)}</small>
                  {entry.changes && <ChangeDetails {...entry.changes} />}
                  {entry.note && <p>{entry.note}</p>}
                </li>
              ))
            ) : (
              <li>
                No updates yet. The original report stays in your history.
              </li>
            )}
          </ol>
        )}
        <div className="ap-dialog-actions">
          <button
            type="button"
            className="ap-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="ap-button ap-primary"
            disabled={busy || (!changed && !note.trim())}
          >
            {busy ? "Saving…" : "Save update"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function MaintenancePage() {
  const { api } = useAdmin();
  const [filters, setFilters] = useState<Filters>({
    status: "unresolved",
    page: 1,
  });
  const [selected, setSelected] = useState<MaintenanceRecord | null>(null);
  const [success, setSuccess] = useState("");
  const query = useQuery(
    () => api.maintenance(filters),
    [api, JSON.stringify(filters)],
  );
  return (
    <>
      <PageHeader
        eyebrow="KEEP THINGS RUNNING"
        title="Maintenance"
        description="Track reports from first response to resolution. Every update stays in the history."
        action={
          <div className="ap-inline">
            <ExportButton dataset="maintenance" filters={filters} />
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
      {success && <Notice kind="success">{success}</Notice>}
      <section className="ap-panel">
        <QueueFilters filters={filters} onChange={setFilters}>
          <Field label="Status">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value, page: 1 })
              }
            >
              <option value="unresolved">Unresolved</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="all">All history</option>
            </select>
          </Field>
          <Field label="Category">
            <select
              value={filters.category ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, category: e.target.value, page: 1 })
              }
            >
              <option value="">All categories</option>
              {[
                "Washer/Dryer Maintenance",
                "App Maintenance",
                "Location Maintenance",
                "Other",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <LocationFilter filters={filters} onChange={setFilters} />
          <Field label="Priority">
            <select
              value={filters.priority ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, priority: e.target.value, page: 1 })
              }
            >
              <option value="">All priorities</option>
              {["low", "normal", "high", "urgent"].map((v) => (
                <option key={v} value={v}>
                  {v[0]!.toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignment">
            <select
              value={filters.assignedTo ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, assignedTo: e.target.value, page: 1 })
              }
            >
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </Field>
          <Field label="Due">
            <select
              value={filters.overdue ? "overdue" : ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  overdue: e.target.value === "overdue",
                  page: 1,
                })
              }
            >
              <option value="">Any due date</option>
              <option value="overdue">Overdue only</option>
            </select>
          </Field>
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
          <Empty title="No matching maintenance reports">
            Try a different filter or date range. Unresolved reports are shown
            regardless of age.
          </Empty>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Location</th>
                  <th>Assignment / due</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.maint_id}>
                    <td>
                      <strong>{item.category}</strong>
                      <small className="ap-description">
                        {item.description}
                      </small>
                      <small>Submitted {dateTime(item.created_at)}</small>
                    </td>
                    <td>{item.location || "Unassigned"}</td>
                    <td>
                      {item.assigned_name || "Unassigned"}
                      <small>
                        {item.due_date ? `Due ${item.due_date}` : "No due date"}
                      </small>
                      {item.overdue && <Badge value="overdue" />}
                    </td>
                    <td>
                      <Badge value={item.status} />
                      <small>
                        <Badge value={item.priority ?? "normal"} />
                      </small>
                    </td>
                    <td>
                      <button
                        className="ap-button"
                        onClick={() => setSelected(item)}
                      >
                        View report
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
      {selected && (
        <MaintenanceDetail
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            setSuccess("Maintenance report updated.");
            query.reload();
          }}
        />
      )}
    </>
  );
}
