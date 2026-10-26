import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import type { Filters } from "./types";
export function PageHeader({
  eyebrow = "WORKSPACE",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="ap-page-header">
      <div>
        <p className="ap-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Notice({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`ap-notice ap-notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="ap-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="ap-loading" role="status">
      <span className="ap-spinner" />
      Loading workspace…
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`ap-badge ap-badge-${value.replaceAll(" ", "_").toLowerCase()}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`ap-dialog ${wide ? "ap-dialog-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="ap-dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="ap-icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="ap-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Pagination({
  page,
  total,
  pageSize = 20,
  onChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="ap-pagination">
      <span>
        {total.toLocaleString()} result{total === 1 ? "" : "s"} · Page {page} of{" "}
        {pages}
      </span>
      <div>
        <button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function QueueFilters({
  filters,
  onChange,
  children,
}: {
  filters: Filters;
  onChange: (value: Filters) => void;
  children?: ReactNode;
}) {
  return (
    <div className="ap-filters">
      <label className="ap-search">
        <Search size={17} />
        <input
          aria-label="Search records"
          type="search"
          placeholder="Search records…"
          value={filters.search ?? ""}
          onChange={(e) =>
            onChange({ ...filters, search: e.target.value, page: 1 })
          }
        />
      </label>
      {children}
      <Field label="From">
        <input
          type="date"
          value={filters.from ?? ""}
          onChange={(e) =>
            onChange({ ...filters, from: e.target.value, page: 1 })
          }
        />
      </Field>
      <Field label="Through">
        <input
          type="date"
          value={filters.to ?? ""}
          onChange={(e) =>
            onChange({ ...filters, to: e.target.value, page: 1 })
          }
        />
      </Field>
    </div>
  );
}
