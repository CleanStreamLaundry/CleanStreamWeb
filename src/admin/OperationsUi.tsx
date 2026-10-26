import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useAdmin } from "./context";
import { Field, Notice } from "./ui";
import { useQuery } from "./query";
import { recordsCsv } from "./csv";
import { portalRole } from "./permissions";
import type { ExportDataset, Filters, ValueChanges } from "./types";

export function ExportButton({
  dataset,
  filters,
  disabled = false,
}: {
  dataset: ExportDataset;
  filters: Filters;
  disabled?: boolean;
}) {
  const { api, identity } = useAdmin();
  const scope = `${identity?.id}:${portalRole(identity)}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.exportRecords(dataset, filters);
      if (!mounted.current || currentScope.current !== scope) return;
      if (result.rows.length !== result.total)
        throw new Error(
          "The export was incomplete. Narrow your filters and retry.",
        );
      const url = URL.createObjectURL(
        new Blob([recordsCsv(dataset, result.rows, portalRole(identity) ?? "Maintenance")], {
          type: "text/csv;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `cleanstream-${dataset}-${result.exportedAt.slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(`${result.total.toLocaleString()} matching records exported.`);
    } catch (e) {
      if (mounted.current && currentScope.current === scope) setError((e as Error).message);
    } finally {
      if (mounted.current && currentScope.current === scope) setBusy(false);
    }
  }
  return (
    <div className="ap-export">
      <button
        className="ap-button"
        disabled={disabled || busy}
        onClick={() => void download()}
        title="Export all matching records, up to 5,000, using the current filters"
      >
        <Download size={16} />
        {busy ? "Exporting…" : "Export CSV"}
      </button>
      {error && <Notice>{error}</Notice>}
      {success && <small role="status">{success}</small>}
    </div>
  );
}
export function LocationFilter({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const { api } = useAdmin();
  const query = useQuery(() => api.locations(), [api]);
  return (
    <Field label="Location">
      <select
        disabled={query.loading || !!query.error}
        value={filters.locationId ?? ""}
        onChange={(e) => {
          const next = { ...filters, page: 1 };
          if (e.target.value) next.locationId = Number(e.target.value);
          else delete next.locationId;
          onChange(next);
        }}
      >
        <option value="">All accessible</option>
        {query.data?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.Name}
          </option>
        ))}
      </select>
      {query.error && (
        <small role="alert">
          Locations unavailable.{" "}
          <button className="ap-text-button" onClick={query.reload}>
            Retry
          </button>
        </small>
      )}
    </Field>
  );
}
const fieldNames: Record<string, string> = {
  assigned_to: "Assigned user ID",
  assignee: "Assigned to",
  due_date: "Due date",
  is_out_of_service: "Out of service",
  service_reason: "Service note",
  price_cents: "Price (cents)",
  Location_ID: "Location ID",
  Machine_type: "Machine type",
  Name: "Name",
  Weight_kg: "Capacity (kg)",
  Price: "Price (USD)",
  Runtime: "Runtime (minutes)",
  user_id: "User ID",
  roles: "Role",
};
function valueText(value: unknown): string {
  return value == null
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
}
export function ChangeDetails({ before, after }: ValueChanges) {
  const fields = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].filter(
    (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
  );
  return fields.length ? (
    <dl className="ap-changes">
      {fields.map((key) => (
        <div key={key}>
          <dt>{fieldNames[key] ?? key.replaceAll("_", " ")}</dt>
          <dd>
            <span>
              {key === "status"
                ? valueText(before?.[key]).replaceAll("_", " ")
                : valueText(before?.[key])}
            </span>
            <span aria-label="changed to"> → </span>
            <strong>
              {key === "status"
                ? valueText(after?.[key]).replaceAll("_", " ")
                : valueText(after?.[key])}
            </strong>
          </dd>
        </div>
      ))}
    </dl>
  ) : null;
}
