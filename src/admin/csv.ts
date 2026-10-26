import type { ExportDataset, PortalRole } from "./types";

const columns: Record<ExportDataset, [string, string][]> = {
  transactions: [
    ["id", "Record ID"],
    ["date", "Created (ISO 8601)"],
    ["source", "Record source"],
    ["customer_name", "Customer"],
    ["customer_email", "Email"],
    ["location_name", "Location"],
    ["machine_name", "Machine"],
    ["amount", "Amount"],
    ["currency", "Currency"],
    ["category", "Report category"],
    ["collection_provider", "Collection provider"],
    ["vend_provider", "Vend provider"],
    ["environment", "Environment"],
    ["environment_evidence", "Environment evidence"],
    ["reconciliation", "Reconciliation"],
    ["voluntary_refund_id", "Voluntary refund ID"],
    ["voluntary_refund_status", "Voluntary refund status"],
    ["refund_completed_at", "Confirmed refund time"],
    ["payment_succeeded_at", "Verified payment success time"],
    ["amount_cents", "Record value (cents)"],
    ["gross_collection_cents", "Gross collection (cents; blank unknown)"],
    ["refunded_collection_cents", "Refunded collection (cents; blank unknown)"],
    ["net_collection_cents", "Net collection (cents; blank unknown)"],
    ["wallet_spend_cents", "Wallet spend (cents; blank unknown)"],
    ["promo_spend_cents", "Promo spend (cents; blank unknown)"],
    ["promo_issued_cents", "Load promo issued (cents)"],
    ["operational_vend_cents", "Operational vend value (cents)"],
    ["collection_key", "Collection key"],
    ["charge_reference", "Stripe charge"],
    ["nayax_transaction_reference", "Nayax transaction"],
    ["nayax_rrn", "Nayax RRN"],
    ["session_reference", "Session ID"],
    ["wallet_redemption_reference", "Wallet redemption ID"],
    ["payment_method", "Payment method"],
    ["channel", "Channel"],
    ["payment_status", "Payment status"],
    ["status", "Vend status"],
    ["reference", "Reference"],
    ["payment_reference", "Payment reference"],
    ["checkout_reference", "Checkout reference"],
    ["refund_reference", "Refund reference"],
    ["ledger_id", "Ledger ID"],
    ["description", "Description"],
    ["failure_message", "Failure message"],
  ],
  audit: [
    ["id", "Event ID"],
    ["created_at", "Created (ISO 8601)"],
    ["actor_name", "Changed by"],
    ["actor_id", "Actor ID"],
    ["entity", "Record type"],
    ["entity_id", "Record ID"],
    ["operation", "Action"],
    ["location_ids", "Location IDs"],
    ["before_values", "Before"],
    ["after_values", "After"],
  ],
  maintenance: [
    ["maint_id", "Report ID"],
    ["created_at", "Submitted (ISO 8601)"],
    ["location", "Location"],
    ["category", "Category"],
    ["description", "Description"],
    ["status", "Status"],
    ["priority", "Priority"],
    ["assigned_name", "Assigned to"],
    ["due_date", "Due date (Indianapolis)"],
    ["overdue", "Overdue"],
    ["updated_at", "Updated (ISO 8601)"],
  ],
  credits: [
    ["refund_id", "Request ID"],
    ["date", "Requested (ISO 8601)"],
    ["customer_name", "Customer"],
    ["location_id", "Location ID"],
    ["transaction_id", "Transaction ID"],
    ["amount", "Loyalty credit amount (USD)"],
    ["description", "Description"],
    ["status", "Status"],
    ["admin_note", "Resolution note"],
    ["resolved_at", "Resolved (ISO 8601)"],
    ["notification_sent_at", "Notification sent (ISO 8601)"],
  ],
  team: [
    ["user_id", "User ID"],
    ["name", "Name"],
    ["email", "Email"],
    ["portal_role", "Role"],
    ["location_name", "Location"],
    ["assignment_count", "Total location assignments"],
    ["invitation_status", "Account status"],
    ["invited_at", "Invited (ISO 8601)"],
  ],
  machines: [
    ["id", "Machine ID"],
    ["name", "Machine"],
    ["location_name", "Location"],
    ["machine_type", "Type"],
    ["status", "Device status"],
    ["capacity_kg", "Capacity (kg)"],
    ["price", "Price (USD; dryers per 5 minutes)"],
    ["is_out_of_service", "Out of service"],
    ["service_reason", "Service note"],
    ["service_updated_at", "Availability updated (ISO 8601)"],
    ["payment_enabled", "Payment configuration enabled"],
    ["payment_review_required", "Payment review required"],
    ["environment", "Environment"],
  ],
};

export function csvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Quoting alone does not prevent spreadsheets from executing formulas.
  if (
    typeof value !== "number" &&
    (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
  )
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function recordsCsv(
  dataset: ExportDataset,
  rows: Record<string, unknown>[],
  role: PortalRole = "Owner",
): string {
  const selected = columns[dataset].filter(([key]) => dataset !== "machines" || role === "Owner" ||
    !["price", "payment_enabled", "payment_review_required", "environment"].includes(key));
  return (
    "\uFEFF" +
    [
      selected.map(([, title]) => csvCell(title)).join(","),
      ...rows.map((row) =>
        selected.map(([key]) => csvCell(key === "portal_role" ? row.portal_role ?? (row.role === "Admin" ? "Manager" : row.role) : row[key])).join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
