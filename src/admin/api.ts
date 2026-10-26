import { getSupabaseClient } from "../supabase/client";
import type { AdminApi, CustomerMfaRecoveryApi, CustomerMfaRecoveryReceipt, TopupRefund, OwnerAccounts, OwnerChange, OwnerChangeReceipt, OwnerChangeStatus, StaffRoleChange, StaffRoleReceipt, StaffRoleStatus } from "./types";
import { AdminAdmissionError } from "./admission";
import { isMachineIssueReview, machineIssueResolutions, machineIssueUuid } from "./machineIssueContract";

function isTopupRefund(value: unknown): value is TopupRefund {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.load_id === "string" && typeof r.customer_id === "string" &&
    typeof r.status === "string" && ["requested", "approved", "unknown", "pending", "succeeded", "failed", "canceled", "denied"].includes(r.status) &&
    Number.isSafeInteger(r.principal_cents) && Number(r.principal_cents) > 0 &&
    Number.isSafeInteger(r.bonus_reserved_cents) && Number(r.bonus_reserved_cents) >= 0 && r.currency === "usd" &&
    [r.requested_at, r.payment_succeeded_at].every((v) => typeof v === "string" && Number.isFinite(Date.parse(v))) &&
    [r.reviewed_at, r.completed_at].every((v) => v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)))) &&
    typeof r.policy_version === "string" && (r.location_id === null || typeof r.location_id === "string") &&
    (r.review_note === null || typeof r.review_note === "string");
}

async function invokeTopupRefund(ownerId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const client = getSupabaseClient();
  let accountChanged = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") accountChanged = true;
  });
  try {
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session || session.user.id !== ownerId || accountChanged || signal?.aborted) {
      throw new Error("Owner session changed. Refresh request history before taking action.");
    }
    // Pin the initiating bearer. The SDK otherwise resolves the current account
    // again while dispatching, after an asynchronous account switch.
    const { data, error } = await client.functions.invoke("voluntary-topup-refund", {
      body, headers: { Authorization: `Bearer ${session.access_token}` },
      ...(signal ? { signal } : {}),
    });
    if (accountChanged || signal?.aborted) throw new Error("Owner session changed. Refresh request history before taking action.");
    if (error || data?.error) {
      const response = error?.context;
      const failure = response instanceof Response ? await response.json().catch(() => null) : data;
      const messages: Record<string, string> = {
        session_invalid: "Sign in again with your Owner account and verified MFA session.",
        owner_or_location_forbidden: "An active Owner with verified MFA and the required location access is required.",
        refund_unavailable: "This refund request is no longer available. Refresh request history.",
        refund_conflict: "The refund state changed. Refresh request history before taking action.",
        invalid_request: "The refund request could not be accepted. Refresh request history.",
      };
      throw new Error(messages[failure?.error] ?? "Refund outcome is unconfirmed. Refresh request history and reconcile pending or unknown requests. Reserved funds must not be released manually.");
    }
    if (!data || typeof data !== "object" || !("data" in data)) throw new Error("Invalid refund response. Refresh request history before taking action.");
    return data.data;
  } finally { subscription.unsubscribe(); }
}

export async function invoke<T>(
  action: string,
  input: Record<string, unknown> = {},
  accessToken?: string,
  signal?: AbortSignal,
): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "admin-portal",
    { body: { action, ...input },
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
      ...(signal ? { signal } : {}),
    },
  );
  if (error) {
    const response = error.context;
    if (response instanceof Response) {
      const body = await response.json().catch(() => null);
      if (typeof body?.error === "string") throw new AdminAdmissionError(
        body.error,
        typeof body.code === "string" ? body.code : "admin_unavailable",
        typeof body.next_step === "string" ? body.next_step : undefined,
      );
    }
    throw new Error(
      "The admin service is unavailable. Please retry or contact your portal administrator.",
    );
  }
  if (!data || data.error)
    throw new Error(data?.error || "The admin service returned no data.");
  return data as T;
}

async function invokeMutation<T>(action: string, input: Record<string, unknown>, callerId?: string, signal?: AbortSignal): Promise<T> {
  const client = getSupabaseClient();
  let accountChanged = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") accountChanged = true;
  });
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (accountChanged || signal?.aborted || (callerId && session?.user.id !== callerId)) throw new Error("Admin session changed. Review the current state before taking further action.");
    if (error || !session?.access_token) throw new AdminAdmissionError("Sign in to continue.", "session_invalid", "sign_in");
    // The SDK awaits another session lookup during dispatch. An explicit bearer
    // prevents that lookup from substituting a replacement account's credentials.
    const result = await invoke<T>(action, input, session.access_token, signal);
    if (accountChanged || signal?.aborted) throw new Error("Admin session changed. Review the current state before taking further action.");
    return result;
  } catch (error) {
    // Includes asynchronous error-body parsing in invoke; a departed caller's
    // admission error must not become the replacement caller's MFA state.
    if (accountChanged || signal?.aborted) throw new Error("Admin session changed. Review the current state before taking further action.", { cause: error });
    throw error;
  } finally { subscription.unsubscribe(); }
}

const ownerRoles = ["User", "Admin", "Owner"];
const ownerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ownerReceipt(value: unknown, requestId: string): value is OwnerChangeReceipt {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.userId === "string" && ownerUuid.test(r.userId) &&
    r.requestId === requestId && ownerRoles.includes(String(r.role)) && typeof r.changed === "boolean";
}

// All three actions use the existing captured-bearer transport. The server
// revalidates canonical Owner/MFA authority; status reads never replay writes.
export const ownerManagementApi = {
  accounts: async (callerId: string, query: string, page: number, signal: AbortSignal): Promise<OwnerAccounts> => {
    const result = await invokeMutation<OwnerAccounts>("ownerAccounts", { query, page }, callerId, signal);
    if (!result || !Array.isArray(result.items) || result.items.length > 25 ||
      result.page !== page || result.pageSize !== 25 ||
      !Number.isSafeInteger(result.total) || result.total < 0 ||
      !Number.isSafeInteger(result.activeOwnerCount) || result.activeOwnerCount < 0 ||
      !result.items.every(r => r && typeof r.userId === "string" && ownerUuid.test(r.userId) &&
        (r.name === null || typeof r.name === "string") && (r.email === null || typeof r.email === "string") &&
        ownerRoles.includes(r.role) && Array.isArray(r.locationIds) && r.locationIds.every(Number.isSafeInteger) &&
        typeof r.ownerEligible === "boolean" && (r.restriction === null || typeof r.restriction === "string")) ||
      new Set(result.items.map(r => r.userId)).size !== result.items.length) {
      throw new Error("Owner accounts could not be verified. Refresh before taking action.");
    }
    return result;
  },
  setOwner: async (callerId: string, input: OwnerChange, signal: AbortSignal): Promise<OwnerChangeReceipt> => {
    if (input.userId.toLowerCase() === callerId.toLowerCase() || !ownerUuid.test(input.userId) ||
      !ownerUuid.test(input.requestId) || !input.note.trim() || input.note.length > 4000) {
      throw new AdminAdmissionError("Review another existing account and provide a reason.", "invalid_request");
    }
    const result = await invokeMutation<unknown>("setOwner", { ...input }, callerId, signal);
    if (!ownerReceipt(result, input.requestId) || result.userId !== input.userId ||
      (input.owner ? result.role !== "Owner" : result.role === "Owner")) {
      throw new Error("Owner change outcome is unconfirmed. Check request status before taking further action.");
    }
    return result;
  },
  status: async (callerId: string, requestId: string, signal: AbortSignal): Promise<OwnerChangeStatus> => {
    const result = await invokeMutation<OwnerChangeStatus>("ownerChangeStatus", { requestId }, callerId, signal);
    if (result?.state === "not_found") return result;
    if (result?.state === "completed" && ownerReceipt(result.result, requestId)) return result;
    throw new Error("Owner change outcome is unconfirmed. Check request status before taking further action.");
  },
};

function staffRoleReceipt(value: unknown, requestId: string): value is StaffRoleReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.userId === "string" && ownerUuid.test(receipt.userId) &&
    receipt.requestId === requestId && ["Manager", "Maintenance"].includes(String(receipt.portalRole)) &&
    typeof receipt.changed === "boolean";
}

export const staffRoleApi = {
  setRole: async (callerId: string, input: StaffRoleChange, signal: AbortSignal): Promise<StaffRoleReceipt> => {
    if (input.userId.toLowerCase() === callerId.toLowerCase() || !ownerUuid.test(input.userId) ||
      !ownerUuid.test(input.requestId) || !input.note.trim() || input.note.length > 4000 ||
      !["Manager", "Maintenance"].includes(input.portalRole) || !["Manager", "Maintenance"].includes(input.expectedPortalRole)) {
      throw new AdminAdmissionError("Choose another staff account and provide a reason.", "invalid_request");
    }
    const result = await invokeMutation<unknown>("setStaffRole", { ...input }, callerId, signal);
    if (!staffRoleReceipt(result, input.requestId) || result.userId !== input.userId || result.portalRole !== input.portalRole) {
      throw new Error("Access change outcome is unconfirmed. Check request status before taking further action.");
    }
    return result;
  },
  status: async (callerId: string, requestId: string, signal: AbortSignal): Promise<StaffRoleStatus> => {
    if (!ownerUuid.test(requestId)) throw new AdminAdmissionError("Invalid access change reference.", "invalid_request");
    const result = await invokeMutation<StaffRoleStatus>("staffRoleStatus", { requestId }, callerId, signal);
    if (result?.state === "not_found") return result;
    if (result?.state === "completed" && staffRoleReceipt(result.result, requestId)) return result;
    throw new Error("Access change outcome is unconfirmed. Check request status before taking further action.");
  },
};

export const adminApi: AdminApi = {
  machineIssueReview: async (callerId, id, requestId, signal) => {
    if (!Number.isSafeInteger(id) || id <= 0 || (requestId !== undefined && !machineIssueUuid.test(requestId))) {
      throw new AdminAdmissionError("Invalid machine issue reference.", "invalid_request");
    }
    const result = await invokeMutation<unknown>("machineIssueReview", { id, ...(requestId ? { requestId } : {}) }, callerId, signal);
    if (!isMachineIssueReview(result, id, requestId)) throw new Error("Machine issue review could not be verified. No new action is safe until the existing outcome is confirmed.");
    return result;
  },
  resolveMachineIssue: async (callerId, input, signal) => {
    if (!Number.isSafeInteger(input.id) || input.id <= 0 || !machineIssueUuid.test(input.requestId) ||
      !machineIssueResolutions.includes(input.resolution) || !input.note.trim() || input.note.length > 4000 ||
      typeof input.atLocation !== "boolean" || typeof input.anotherLoadCompleted !== "boolean" ||
      (input.resolution !== "manual_review" && !input.atLocation) ||
      (input.resolution === "wallet_refund" && !input.anotherLoadCompleted) ||
      (input.resolution === "replacement_vend" && (input.anotherLoadCompleted || !Number.isSafeInteger(input.replacementMachineId) || Number(input.replacementMachineId) <= 0))) {
      throw new AdminAdmissionError("Review the attestations, resolution and note before submitting.", "invalid_request");
    }
    // Construct the wire payload explicitly: amounts and historical location are server-owned.
    const body = { id: input.id, requestId: input.requestId, resolution: input.resolution,
      note: input.note, atLocation: input.atLocation, anotherLoadCompleted: input.anotherLoadCompleted,
      ...(input.resolution === "replacement_vend" ? { replacementMachineId: input.replacementMachineId } : {}) };
    const result = await invokeMutation<{ success?: unknown; alreadyResolved?: unknown; review?: unknown }>("resolveMachineIssue", body, callerId, signal);
    if (result?.success !== true || typeof result.alreadyResolved !== "boolean" ||
      !isMachineIssueReview(result.review, input.id, input.requestId) ||
      result.review.receipt?.resolution !== input.resolution) {
      throw new Error("Machine issue outcome is unconfirmed. Check request status; do not repeat the action.");
    }
    return { success: true, alreadyResolved: result.alreadyResolved, review: result.review };
  },
  topupRefunds: async (ownerId, cursor) => {
    const rows = await invokeTopupRefund(ownerId, { action: "list", ...(cursor ? { before: cursor.before, before_id: cursor.before_id } : {}) });
    if (!Array.isArray(rows) || rows.length > 100 || !rows.every(isTopupRefund) || new Set(rows.map((r) => r.id)).size !== rows.length) {
      throw new Error("Invalid refund history response. Refresh before taking action.");
    }
    return rows;
  },
  reviewTopupRefund: async (ownerId, id, action, note, signal) => {
    const result = await invokeTopupRefund(ownerId, { action, id, note }, signal);
    if (!isTopupRefund(result) || result.id !== id) throw new Error("Refund outcome is unconfirmed. Refresh request history before taking action.");
    return result;
  },
  transactions: (filters) => invoke("transactions", { filters }),
  audit: (filters) => invoke("audit", { filters }),
  exportRecords: (dataset, filters) =>
    invoke("exportRecords", { dataset, filters }),
  assignees: (id) => invoke("assignees", { id }),
  setAvailability: (id, outOfService, reason, expectedUpdatedAt) =>
    invokeMutation("setAvailability", { id, outOfService, reason, expectedUpdatedAt }),
  identity: async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new AdminAdmissionError("Sign in to continue.", "session_invalid", "sign_in");
    return invoke("identity", {}, data.session.access_token);
  },
  locations: () => invoke("locations"),
  machines: (locationId) => invoke("machines", { locationId }),
  rates: (locationId) => invoke("rates", { locationId }),
  createLocation: (input) => invokeMutation("createLocation", { input }),
  createMachine: (input) => invokeMutation("createMachine", { input }),
  deleteMachine: (id) => invokeMutation("deleteMachine", { id }),
  saveRate: (rate) => invokeMutation("saveRate", { rate }),
  saveConfig: (config) => invokeMutation("saveConfig", { config }),
  maintenance: (filters) => invoke("maintenance", { filters }),
  history: (id) => invoke("history", { id }),
  updateMaintenance: (id, status, note, expectedUpdatedAt, planning) =>
    invokeMutation("updateMaintenance", {
      id,
      status,
      note,
      expectedUpdatedAt,
      ...planning,
    }),
  credits: (filters) => invoke("credits", { filters }),
  resolveCredit: (id, decision, note) =>
    invokeMutation("resolveCredit", { id, decision, note }),
  team: (filters) => invoke("team", { filters }),
  invite: (email, locationIds, portalRole = "Manager") => invokeMutation("invite", { email, locationIds, portalRole }),
  resend: (userId, locationId) => invokeMutation("resend", { userId, locationId }),
  removeMember: (userId, locationId) =>
    invokeMutation("removeMember", { userId, locationId }),
  overview: () => invoke("overview"),
};

const recoveryMessages = {
  invalid_request: "Enter the exact customer UUID and a non-sensitive support case reference.",
  session_invalid: "Sign out and sign in again with your Owner account and MFA.",
  session_changed: "Owner session changed. Inspect the customer again before taking action.",
  recovery_forbidden: "Recovery is not permitted for this Owner session or customer.",
  fresh_sign_in_required: "A new Owner sign-in with MFA is required. Refreshing the session is not sufficient.",
  recovery_conflict: "The recovery state or support case changed. Inspect before taking further action.",
  recovery_unavailable: "Recovery outcome is unconfirmed. Inspect the customer before deliberately retrying the same support case.",
} as const;
type RecoveryErrorCode = keyof typeof recoveryMessages;
export class CustomerMfaRecoveryError extends Error {
  constructor(readonly code: RecoveryErrorCode) {
    super(recoveryMessages[code]);
    this.name = "CustomerMfaRecoveryError";
  }
}

const recoveryUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validRecoveryCase(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 &&
    value.length <= 120 && ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}
function recoveryReceipt(value: unknown, target: string, supportCase?: string): CustomerMfaRecoveryReceipt {
  const r = value as Partial<CustomerMfaRecoveryReceipt> | null;
  const started = r?.state === "removal_pending" || r?.state === "reenrollment_required";
  if (!r || typeof r !== "object" || r.target_user_id !== target ||
    (!started && r.state !== "not_started") || r.reenrollment_required !== started ||
    (started ? typeof r.recovery_id !== "string" || !recoveryUuid.test(r.recovery_id) || !validRecoveryCase(r.support_case)
      : r.recovery_id !== null || r.support_case !== null) ||
    (supportCase !== undefined && (!started || r.support_case !== supportCase))) {
    throw new CustomerMfaRecoveryError("recovery_unavailable");
  }
  return {
    target_user_id: target, recovery_id: r.recovery_id!, support_case: r.support_case!,
    state: r.state!, reenrollment_required: started,
  };
}

async function invokeCustomerMfaRecovery(
  ownerId: string, targetId: string, signal: AbortSignal,
  recovery?: { supportCase: string; identityVerified: true },
): Promise<CustomerMfaRecoveryReceipt> {
  const target = targetId.trim().toLowerCase();
  const supportCase = recovery?.supportCase.trim();
  if (!recoveryUuid.test(target) || target === ownerId.toLowerCase() ||
    (recovery && (!validRecoveryCase(supportCase) || recovery.identityVerified !== true))) {
    throw new CustomerMfaRecoveryError("invalid_request");
  }
  const client = getSupabaseClient();
  let changed = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") changed = true;
  });
  const assertCurrent = () => {
    if (changed || signal.aborted) throw new CustomerMfaRecoveryError("session_changed");
  };
  try {
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    assertCurrent();
    if (sessionError || !session?.access_token || session.user.id !== ownerId) {
      throw new CustomerMfaRecoveryError("session_invalid");
    }
    const { data, error } = await client.functions.invoke("customer-mfa-recovery", {
      body: recovery
        ? { action: "recover", target_user_id: target, support_case: supportCase, identity_verified: true }
        : { action: "inspect", target_user_id: target },
      headers: { Authorization: `Bearer ${session.access_token}` }, signal,
    });
    assertCurrent();
    if (error || data?.error) {
      const failure = error?.context instanceof Response ? await error.context.json().catch(() => null) : data;
      assertCurrent();
      const code: unknown = failure?.error;
      throw new CustomerMfaRecoveryError(
        typeof code === "string" && Object.hasOwn(recoveryMessages, code)
          ? code as RecoveryErrorCode : "recovery_unavailable",
      );
    }
    return recoveryReceipt(data, target, supportCase);
  } catch (error) {
    assertCurrent();
    throw error instanceof CustomerMfaRecoveryError ? error : new CustomerMfaRecoveryError("recovery_unavailable");
  } finally { subscription.unsubscribe(); }
}

export const customerMfaRecoveryApi: CustomerMfaRecoveryApi = {
  inspect: (ownerId, targetId, signal) => invokeCustomerMfaRecovery(ownerId, targetId, signal),
  recover: (ownerId, targetId, supportCase, identityVerified, signal) =>
    invokeCustomerMfaRecovery(ownerId, targetId, signal, { supportCase, identityVerified }),
};
