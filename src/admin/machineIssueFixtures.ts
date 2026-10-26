import type { MachineIssueResolutionInput, MachineIssueReview } from "./types";

export const machineIssueFixture: MachineIssueReview = {
  refundId: 2041, transactionId: 9914, status: "pending", policyVersion: "same_day_v1",
  amountCents: 350, paidAmountCents: 250, promoAmountCents: 100,
  locationId: 7, locationTimezone: "America/Indiana/Indianapolis",
  transactionAt: "2026-10-05T13:00:00Z", receivedAt: "2026-10-05T13:30:00Z",
  sameDayEligible: true, manualReviewReason: null, financialResolution: null, receipt: null,
  capabilities: { walletRefund: true, replacementVend: true },
  replacementMachines: [{ id: 12, name: "Washer 12", amountCents: 350 }], replacementUnavailableReason: null,
};

export function machineIssueResult(input: MachineIssueResolutionInput, state: "recorded" | "completed" | "pending" | "support_required" = input.resolution === "manual_review" ? "recorded" : "completed") {
  const review: MachineIssueReview = { ...machineIssueFixture,
    receipt: { requestId: input.requestId, resolution: input.resolution, state },
    financialResolution: input.resolution === "manual_review" ? null : {
      kind: input.resolution, state: state === "recorded" ? "pending" : state, requestId: input.requestId,
    },
  };
  return { success: true as const, alreadyResolved: false, review };
}
