import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader, Pagination, QueueFilters } from "./ui";
import { dateTime, timezone } from "./format";
import { useQuery } from "./query";
import { ExportButton, LocationFilter } from "./OperationsUi";
import type { Filters, Transaction } from "./types";

const amount = (t: Transaction) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: t.currency || "USD",
  }).format(t.amount_cents == null ? t.amount : t.amount_cents / 100);
const reportMoney = (t: Transaction, cents: number | null | undefined) =>
  cents == null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency || "USD" }).format(cents / 100);
export default function TransactionsPage() {
  const { api } = useAdmin();
  const [filters, setFilters] = useState<Filters>({ status: "all", page: 1 });
  const [selected, setSelected] = useState<Transaction | null>(null);
  const query = useQuery(
    () => api.transactions(filters),
    [api, JSON.stringify(filters)],
  );
  return (
    <>
      <PageHeader
        eyebrow="PAYMENTS & HISTORY"
        title="Transactions"
        description="Find payments by customer, machine, or reference and see what happened."
        action={
          <div className="ap-inline">
            <ExportButton dataset="transactions" filters={filters} />
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
        Dates use {timezone}. Pending and failed attempts are included.
        Historical ledger entries without a machine link are labeled
        Unattributed and are visible only to Owners.
        Direct Nayax device payments: Not connected. Last sync: Never.
      </p>
      <section className="ap-panel">
        <QueueFilters filters={filters} onChange={setFilters}>
          <LocationFilter filters={filters} onChange={setFilters} />
          <Field label="Report category">
            <select value={filters.category ?? ""} onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}>
              <option value="">All categories</option>
              {["machine_collection", "wallet_funding", "wallet_spend", "unknown_legacy"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Payment status">
            <select
              value={filters.paymentStatus ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  paymentStatus: e.target.value,
                  page: 1,
                })
              }
            >
              <option value="">All payments</option>
              {[
                "pending",
                "received",
                "refunded",
                "voided",
                "unconfirmed",
                "recorded",
              ].map((v) => (
                <option key={v} value={v}>
                  {v[0]!.toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Machine outcome">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value, page: 1 })
              }
            >
              <option value="all">All outcomes</option>
              {[
                "payment_pending",
                "paid",
                "starting",
                "awaiting_sale",
                "approved",
                "started",
                "failed",
                "timed_out",
                "support_required",
                "refunded",
                "voided",
                "recorded",
              ].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll("_", " ")}
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
          <Empty title="No matching transactions">
            Try another customer, reference, location, or date range.
          </Empty>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Customer / reference</th>
                  <th>Machine / location</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Collection / vend provider</th>
                  <th>Payment / outcome</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.customer_name}</strong>
                      <small className="ap-description" title={t.reference}>
                        {t.reference}
                      </small>
                    </td>
                    <td>
                      {t.machine_name ?? "Unattributed"}
                      <small>
                        {t.location_name ?? "Location unknown"}
                      </small>
                    </td>
                    <td className="ap-date">{dateTime(t.date)}</td>
                    <td className="ap-numeric">
                      {amount(t)}
                      <small>
                        {t.payment_method === "unattributed"
                          ? "Method unknown"
                          : t.payment_method}
                      </small>
                    </td>
                    <td>
                      {t.collection_provider ?? "unknown"} / {t.vend_provider ?? "unknown"}
                      <small>{t.category?.replaceAll("_", " ") ?? "Unclassified"} · {t.environment ?? "unknown"}</small>
                    </td>
                    <td>
                      <Badge value={t.payment_status} />
                      <small>
                        {t.source === "legacy"
                          ? "Historical record"
                          : t.status.replaceAll("_", " ")}
                      </small>
                    </td>
                    <td>
                      <button
                        className="ap-button"
                        onClick={() => setSelected(t)}
                      >
                        View details
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
          title="Transaction details"
          description={selected.description}
          onClose={() => setSelected(null)}
          wide
        >
          <dl className="ap-detail-grid">
            {[
              ["Customer", selected.customer_name],
              ["Email", selected.customer_email ?? "Guest / unavailable"],
              ["Amount", amount(selected)],
              ["Category", selected.category?.replaceAll("_", " ") ?? "Unknown"],
              ["Collection provider", selected.collection_provider ?? "Unknown"],
              ["Vend provider", selected.vend_provider ?? "Unknown"],
              ["Environment", selected.environment ?? "Unknown"],
              ["Environment evidence", selected.environment_evidence?.replaceAll("_", " ") ?? "Unknown"],
              ["Voluntary refund ID", selected.voluntary_refund_id ?? "None recorded"],
              ["Voluntary refund status", selected.voluntary_refund_status ?? "None recorded"],
              ["Confirmed refund time", selected.refund_completed_at ? dateTime(selected.refund_completed_at) : "Not confirmed"],
              ["Reconciliation", selected.reconciliation?.replaceAll("_", " ") ?? "Unknown"],
              ["Gross collection", reportMoney(selected, selected.gross_collection_cents)],
              ["Refunded collection", reportMoney(selected, selected.refunded_collection_cents)],
              ["Net collection", reportMoney(selected, selected.net_collection_cents)],
              ["Wallet spend", reportMoney(selected, selected.wallet_spend_cents)],
              ["Promo spend", reportMoney(selected, selected.promo_spend_cents)],
              ["Operational vend value", reportMoney(selected, selected.operational_vend_cents)],
              ["Collection key", selected.collection_key ?? "Unknown"],
              ["Stripe charge", selected.charge_reference ?? "Not recorded"],
              ["Nayax transaction", selected.nayax_transaction_reference ?? "Not recorded"],
              ["Nayax RRN", selected.nayax_rrn ?? "Not recorded"],
              ["Session ID", selected.session_reference ?? "Not recorded"],
              ["Wallet redemption ID", selected.wallet_redemption_reference ?? "Not recorded"],
              ["Payment status", selected.payment_status],
              ["Machine outcome", selected.status.replaceAll("_", " ")],
              ["Payment method", selected.payment_method],
              ["Machine", selected.machine_name ?? "Unattributed"],
              ["Location", selected.location_name ?? "Unattributed"],
              ["Created", dateTime(selected.date)],
              [
                "Completed",
                selected.completed_at
                  ? dateTime(selected.completed_at)
                  : "Not recorded",
              ],
              ["Channel", selected.channel ?? "Historical ledger"],
              ["Reference", selected.reference],
              [
                "Payment reference",
                selected.payment_reference ?? "Not recorded",
              ],
              [
                "Checkout reference",
                selected.checkout_reference ?? "Not recorded",
              ],
              ["Refund reference", selected.refund_reference ?? "Not recorded"],
              ["Ledger ID", selected.ledger_id ?? "No linked ledger entry"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {selected.failure_message && (
            <Notice>{selected.failure_message}</Notice>
          )}
          <Notice kind="info">
            {selected.source === "legacy"
              ? "This historical entry does not establish a machine, location, or processor settlement status."
              : "Payment status and machine outcome are separate. “Unconfirmed” means this record does not establish the final payment result; use the payment reference to investigate."}{" "}
            Local refund/void status alone does not establish a completed processor refund.
            Stripe collection and its Nayax vend are one collection.
            Loyalty Credits are recorded separately and do not refund the
            original payment method.
          </Notice>
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
