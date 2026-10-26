import type { MachineIssueReview } from "./types";

export const machineIssueUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const machineIssueResolutions = ["wallet_refund", "replacement_vend", "manual_review"] as const;
const positiveId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const cents = (value: unknown) => value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
const nullableText = (value: unknown) => value === null || typeof value === "string";
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function isMachineIssueReview(value: unknown, id: number, requestId?: string): value is MachineIssueReview {
  if (!value || typeof value !== "object") return false;
  const r = value as MachineIssueReview;
  if (r.refundId !== id || !positiveId(r.transactionId) ||
    !["pending", "approved", "denied"].includes(r.status) ||
    !["legacy_14_day", "same_day_v1"].includes(r.policyVersion) ||
    ![r.amountCents, r.paidAmountCents, r.promoAmountCents].every(cents) ||
    (r.locationId !== null && !positiveId(r.locationId)) || !nullableText(r.locationTimezone) ||
    (r.transactionAt !== null && !timestamp(r.transactionAt)) || !timestamp(r.receivedAt) ||
    typeof r.sameDayEligible !== "boolean" || !nullableText(r.manualReviewReason) ||
    !nullableText(r.replacementUnavailableReason) || !r.capabilities ||
    typeof r.capabilities.walletRefund !== "boolean" || typeof r.capabilities.replacementVend !== "boolean" ||
    !Array.isArray(r.replacementMachines) || !r.replacementMachines.every(m => m && positiveId(m.id) &&
      typeof m.name === "string" && Number.isSafeInteger(m.amountCents) && m.amountCents > 0 && m.amountCents === r.amountCents) ||
    new Set(r.replacementMachines.map(m => m.id)).size !== r.replacementMachines.length) return false;
  if (r.paidAmountCents !== null && r.promoAmountCents !== null &&
    r.paidAmountCents + r.promoAmountCents !== r.amountCents) return false;
  if (r.financialResolution !== null) {
    const f = r.financialResolution;
    if (!f || !["wallet_refund", "replacement_vend"].includes(f.kind) ||
      !["pending", "completed", "support_required"].includes(f.state) ||
      typeof f.requestId !== "string" || !machineIssueUuid.test(f.requestId)) return false;
  }
  if (r.receipt !== null) {
    const receipt = r.receipt;
    if (!receipt || !requestId || receipt.requestId !== requestId ||
      !machineIssueResolutions.includes(receipt.resolution) ||
      (receipt.resolution === "manual_review" ? receipt.state !== "recorded"
        : !["pending", "completed", "support_required"].includes(receipt.state))) return false;
  }
  return true;
}
