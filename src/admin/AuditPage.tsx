import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader, Pagination, QueueFilters } from "./ui";
import { dateTime } from "./format";
import { useQuery } from "./query";
import {
  ChangeDetails,
  ExportButton,
  LocationFilter,
} from "./OperationsUi";
import type { AuditEvent, Filters } from "./types";

const entityNames: Record<string, string> = {
  machine: "Machine",
  location: "Location",
  washer_rate: "Washer pricing",
  payment_config: "Payment setup",
  membership: "Location access",
  invitation: "Invitation",
  maintenance: "Maintenance",
  loyalty_credit: "Loyalty Credit",
  role: "Account role",
};

export default function AuditPage() {
  const { api } = useAdmin();
  const [filters, setFilters] = useState<Filters>({ page: 1 });
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const query = useQuery(
    () => api.audit(filters),
    [api, JSON.stringify(filters)],
  );
  return (
    <>
      <PageHeader
        eyebrow="ACCOUNTABILITY"
        title="Audit Log"
        description="Review who changed your operations, when they changed them, and the values before and after."
        action={
          <div className="ap-inline">
            <ExportButton dataset="audit" filters={filters} />
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
      <p className="ap-page-note">
        Owner access · Recorded from activation onward · Times and date filters
        use America/Indiana/Indianapolis. Trusted system changes are labeled
        separately.
      </p>
      <section className="ap-panel">
        <QueueFilters filters={filters} onChange={setFilters}>
          <LocationFilter filters={filters} onChange={setFilters} />
          <Field label="Record type">
            <select
              value={filters.entity ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, entity: e.target.value, page: 1 })
              }
            >
              <option value="">All record types</option>
              {Object.entries(entityNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
          <Empty title="No matching audit events">
            Future operational changes will appear here. Try a different filter
            to see earlier recorded activity.
          </Empty>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Changed by</th>
                  <th>Record</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((event) => (
                  <tr key={event.id}>
                    <td className="ap-date">{dateTime(event.created_at)}</td>
                    <td>
                      <strong>{event.actor_name}</strong>
                      {!event.actor_id && <small>Trusted system change</small>}
                    </td>
                    <td>
                      {entityNames[event.entity] ?? event.entity}
                      <small className="ap-description" title={event.entity_id}>
                        ID {event.entity_id}
                      </small>
                    </td>
                    <td>
                      <Badge
                        value={
                          event.operation === "insert"
                            ? "created"
                            : event.operation === "delete"
                              ? "removed"
                              : "updated"
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="ap-button"
                        onClick={() => setSelected(event)}
                      >
                        View changes
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
        <Modal
          title={`${entityNames[selected.entity] ?? selected.entity} changes`}
          description={`${selected.actor_name} · ${dateTime(selected.created_at)}`}
          onClose={() => setSelected(null)}
          wide
        >
          <p className="ap-detail-text">
            Record {selected.entity_id} · {selected.operation}
          </p>
          <ChangeDetails
            before={selected.before_values}
            after={selected.after_values}
          />
          <div className="ap-dialog-actions">
            <button className="ap-button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
