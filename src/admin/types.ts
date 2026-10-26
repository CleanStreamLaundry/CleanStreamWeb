import type {
  CortinaMachineConfig,
  Location,
  Machine as BaseMachine,
  WasherSizeRate,
} from "../interfaces/LocationService";
export type { CortinaMachineConfig, Location, WasherSizeRate };
export type Machine = Omit<BaseMachine, "Price"> & {
  Price?: number;
  is_out_of_service?: boolean;
  service_reason?: string | null;
  service_updated_at?: string;
  service_updated_by?: string | null;
};
export type Role = "Owner" | "Admin";
export type PortalRole = "Owner" | "Manager" | "Maintenance";
export type StaffRole = Exclude<PortalRole, "Owner">;
export interface Identity {
  id: string;
  email: string;
  name: string;
  role: Role;
  portalRole?: PortalRole;
}
export interface Filters {
  search?: string;
  status?: string;
  category?: string;
  priority?: string;
  assignedTo?: string;
  overdue?: boolean;
  entity?: string;
  paymentStatus?: string;
  machineType?: string;
  availability?: string;
  locationId?: number;
  from?: string;
  to?: string;
  page?: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type MaintenanceStatus = "open" | "in_progress" | "resolved";
export interface MaintenanceRecord {
  maint_id: string;
  category: string;
  description: string;
  created_at: string;
  location: string;
  location_id: number | null;
  image_data: string | null;
  status: MaintenanceStatus;
  updated_at: string;
  priority?: MaintenancePriority;
  assigned_to?: string | null;
  assigned_name?: string | null;
  due_date?: string | null;
  overdue?: boolean;
}
export type MaintenancePriority = "low" | "normal" | "high" | "urgent";
export interface MaintenancePlanning {
  priority: MaintenancePriority;
  assignedTo: string | null;
  dueDate: string | null;
}
export interface Assignee {
  id: string;
  name: string;
  email: string;
}
export interface ValueChanges {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export interface HistoryEntry {
  changes?: ValueChanges;
  id: string;
  note: string | null;
  from_status: MaintenanceStatus;
  to_status: MaintenanceStatus;
  actor_name: string;
  created_at: string;
}
export interface Credit {
  location_id?: number | null;
  refund_id: number;
  amount: number;
  description: string;
  date: string;
  status: "pending" | "approved" | "denied";
  customer_name: string;
  transaction_id: string;
  admin_note: string | null;
  resolved_at: string | null;
  notification_sent_at: string | null;
}
export interface Member {
  assignment_count: number;
  user_id: string;
  name: string;
  email: string;
  role: string;
  portal_role?: PortalRole;
  location_id: number;
  location_name: string;
  invitation_status: string;
  invited_at: string | null;
}
export interface OwnerAccount {
  userId: string;
  name: string | null;
  email: string | null;
  role: "User" | "Admin" | "Owner";
  locationIds: number[];
  ownerEligible: boolean;
  restriction: string | null;
}
export interface OwnerChange {
  userId: string;
  owner: boolean;
  expectedRole: OwnerAccount["role"];
  requestId: string;
  note: string;
}
export interface OwnerChangeReceipt {
  userId: string;
  role: OwnerAccount["role"];
  requestId: string;
  changed: boolean;
}
export interface OwnerAccounts {
  items: OwnerAccount[];
  page: number;
  pageSize: 25;
  total: number;
  activeOwnerCount: number;
}
export type OwnerChangeStatus = { state: "completed"; result: OwnerChangeReceipt } | { state: "not_found" };
export interface StaffRoleChange {
  userId: string;
  portalRole: StaffRole;
  expectedPortalRole: StaffRole;
  requestId: string;
  note: string;
}
export interface StaffRoleReceipt {
  userId: string;
  portalRole: StaffRole;
  requestId: string;
  changed: boolean;
}
export type StaffRoleStatus = { state: "completed"; result: StaffRoleReceipt } | { state: "not_found" };
export interface Overview {
  reporting?: CollectionReport;
  today?: number;
  total?: number;
  daily?: { date: string; amount: number }[];
  hourly?: number[];
  pendingCredits?: number;
  openMaintenance: number;
  locations: number;
  machines: number;
  updatedAt: string;
  financialScope?: string;
}
export interface Transaction {
  id: string;
  date: string;
  source: "machine_payment" | "legacy" | "wallet_load";
  category?: ReportCategory;
  collection_provider?: "stripe" | "nayax" | "none" | "unknown";
  vend_provider?: "nayax" | "none" | "unknown";
  environment?: "production" | "sandbox" | "unknown";
  environment_evidence?: "not_recorded" | "stripe_success_event";
  reconciliation?: "recorded" | "pending" | "unknown" | "reversed" | "linked_collection" | "refund_or_outcome_unverified" | "refunded_confirmed";
  voluntary_refund_id?: string | null;
  voluntary_refund_status?: TopupRefundStatus | null;
  refund_completed_at?: string | null;
  payment_succeeded_at?: string | null;
  amount_cents?: number;
  collection_key?: string | null;
  gross_collection_cents?: number | null;
  refunded_collection_cents?: number | null;
  net_collection_cents?: number | null;
  wallet_spend_cents?: number | null;
  promo_spend_cents?: number | null;
  promo_issued_cents?: number | null;
  operational_vend_cents?: number;
  charge_reference?: string | null;
  nayax_transaction_reference?: string | null;
  nayax_rrn?: string | null;
  session_reference?: string | null;
  wallet_redemption_reference?: string | null;
  customer_name: string;
  customer_email: string | null;
  location_id: number | null;
  location_name: string | null;
  machine_id: number | null;
  machine_name: string | null;
  amount: number;
  currency: string;
  payment_method: string;
  channel: string | null;
  status: string;
  payment_status: string;
  reference: string;
  payment_reference: string | null;
  checkout_reference: string | null;
  refund_reference: string | null;
  ledger_id: string | null;
  failure_message: string | null;
  completed_at: string | null;
  description: string;
}
export type ReportCategory = "machine_collection" | "wallet_funding" | "wallet_spend" | "unknown_legacy";
export interface CollectionReport {
  version: 1;
  currency: "USD";
  environment: "unknown" | "mixed";
  scope: string;
  nayaxDirect: {
    availability: "not_connected";
    lastSyncAt: null;
    transactionCount: null;
    netCollectionCents: null;
  };
  stripe: { availability: "local_records_only"; lastSyncAt: null };
  confirmedCollectionCents: number;
  walletSpendCents: number;
  promoSpendCents: number;
  promoIssuedCents: number;
  operationalVendCents: number;
  unresolvedRecords: number;
  buckets: {
    category: ReportCategory;
    provider: "stripe" | "nayax" | "none" | "unknown";
    environment: "production" | "sandbox" | "unknown";
    currency: string;
    records: number;
    amountCents: number;
    grossCollectionCents: number | null;
    refundedCollectionCents: number | null;
    netCollectionCents: number | null;
    unresolvedRecords: number;
  }[];
}
export interface AuditEvent {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  entity: string;
  entity_id: string;
  operation: string;
  location_ids: number[];
  before_values: Record<string, unknown> | null;
  after_values: Record<string, unknown> | null;
}
export type ExportDataset =
  | "transactions"
  | "audit"
  | "maintenance"
  | "credits"
  | "team"
  | "machines";
export interface ExportResult {
  rows: Record<string, unknown>[];
  total: number;
  exportedAt: string;
}
export interface AdminApi {
  machineIssueReview(callerId: string, id: number, requestId?: string, signal?: AbortSignal): Promise<MachineIssueReview>;
  resolveMachineIssue(callerId: string, input: MachineIssueResolutionInput, signal?: AbortSignal): Promise<MachineIssueResolutionResult>;
  topupRefunds(ownerId: string, cursor: TopupRefundCursor | null): Promise<TopupRefund[]>;
  reviewTopupRefund(ownerId: string, id: string, action: TopupRefundAction, note: string, signal?: AbortSignal): Promise<TopupRefund>;
  transactions(filters: Filters): Promise<Page<Transaction>>;
  audit(filters: Filters): Promise<Page<AuditEvent>>;
  exportRecords(
    dataset: ExportDataset,
    filters: Filters,
  ): Promise<ExportResult>;
  assignees(id: string): Promise<Assignee[]>;
  setAvailability(
    id: number,
    outOfService: boolean,
    reason: string,
    expectedUpdatedAt: string,
  ): Promise<void>;
  identity(): Promise<Identity>;
  locations(): Promise<Location[]>;
  machines(locationId: number): Promise<Machine[]>;
  rates(locationId: number): Promise<WasherSizeRate[]>;
  createLocation(input: Omit<Location, "id">): Promise<Location>;
  createMachine(input: Omit<Machine, "id">): Promise<void>;
  deleteMachine(id: number): Promise<void>;
  saveRate(rate: WasherSizeRate): Promise<void>;
  saveConfig(config: CortinaMachineConfig): Promise<void>;
  maintenance(filters: Filters): Promise<Page<MaintenanceRecord>>;
  history(id: string): Promise<HistoryEntry[]>;
  updateMaintenance(
    id: string,
    status: MaintenanceStatus,
    note: string,
    expectedUpdatedAt: string,
    planning?: MaintenancePlanning,
  ): Promise<void>;
  credits(filters: Filters): Promise<Page<Credit>>;
  resolveCredit(
    id: number,
    decision: "approved" | "denied",
    note: string,
  ): Promise<{ notificationWarning?: string }>;
  team(filters: Filters): Promise<Page<Member>>;
  invite(email: string, locationIds: number[], portalRole?: StaffRole): Promise<{ warning?: string }>;
  resend(userId: string, locationId: number): Promise<void>;
  removeMember(userId: string, locationId: number): Promise<void>;
  overview(): Promise<Overview>;
}
export type TopupRefundStatus = "requested" | "approved" | "unknown" | "pending" | "succeeded" | "failed" | "canceled" | "denied";
export type TopupRefundAction = "approve" | "deny" | "reconcile";
export interface TopupRefundCursor { before: string; before_id: string }
export interface TopupRefund {
  id: string;
  load_id: string;
  customer_id: string;
  status: TopupRefundStatus;
  principal_cents: number;
  bonus_reserved_cents: number;
  currency: "usd";
  requested_at: string;
  payment_succeeded_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
  policy_version: string;
  location_id: string | null;
  review_note: string | null;
}

export interface CustomerMfaRecoveryReceipt {
  target_user_id: string;
  recovery_id: string | null;
  support_case: string | null;
  state: "not_started" | "removal_pending" | "reenrollment_required";
  reenrollment_required: boolean;
}
export interface CustomerMfaRecoveryApi {
  inspect(ownerId: string, targetId: string, signal: AbortSignal): Promise<CustomerMfaRecoveryReceipt>;
  recover(ownerId: string, targetId: string, supportCase: string, identityVerified: true, signal: AbortSignal): Promise<CustomerMfaRecoveryReceipt>;
}

export type MachineIssueResolution = "wallet_refund" | "replacement_vend" | "manual_review";
export interface MachineIssueReceipt {
  requestId: string;
  resolution: MachineIssueResolution;
  state: "recorded" | "pending" | "completed" | "support_required";
}
export interface MachineIssueReview {
  refundId: number;
  transactionId: number;
  status: "pending" | "approved" | "denied";
  policyVersion: "legacy_14_day" | "same_day_v1";
  amountCents: number | null;
  paidAmountCents: number | null;
  promoAmountCents: number | null;
  locationId: number | null;
  locationTimezone: string | null;
  transactionAt: string | null;
  receivedAt: string;
  sameDayEligible: boolean;
  manualReviewReason: string | null;
  financialResolution: {
    kind: "wallet_refund" | "replacement_vend";
    state: "pending" | "completed" | "support_required";
    requestId: string;
  } | null;
  capabilities: { walletRefund: boolean; replacementVend: boolean };
  replacementMachines: { id: number; name: string; amountCents: number }[];
  replacementUnavailableReason: string | null;
  receipt: MachineIssueReceipt | null;
}
export interface MachineIssueResolutionInput {
  id: number;
  requestId: string;
  resolution: MachineIssueResolution;
  note: string;
  atLocation: boolean;
  anotherLoadCompleted: boolean;
  replacementMachineId?: number;
}
export interface MachineIssueResolutionResult {
  success: true;
  alreadyResolved: boolean;
  review: MachineIssueReview;
}
