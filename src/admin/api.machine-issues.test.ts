import { beforeEach, expect, it, vi } from "vitest";
import { adminApi } from "./api";
import { machineIssueFixture, machineIssueResult } from "./machineIssueFixtures";
import type { MachineIssueResolutionInput } from "./types";

const mock = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mock.session, onAuthStateChange: mock.subscribe }, functions: { invoke: mock.invoke },
}) }));
const caller = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const input: MachineIssueResolutionInput = { id: 2041, requestId, resolution: "wallet_refund", note: "Confirmed with customer", atLocation: true, anotherLoadCompleted: true };
let authEvent: (event: string) => void;
beforeEach(() => {
  vi.resetAllMocks();
  mock.session.mockResolvedValue({ data: { session: { user: { id: caller }, access_token: "captured-owner" } }, error: null });
  mock.subscribe.mockImplementation((callback: typeof authEvent) => { authEvent = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; });
});
it("reads authoritative review with the captured Owner bearer", async () => {
  mock.invoke.mockResolvedValue({ data: machineIssueFixture, error: null });
  const signal = new AbortController().signal;
  expect(await adminApi.machineIssueReview(caller, 2041, undefined, signal)).toEqual(machineIssueFixture);
  expect(mock.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "machineIssueReview", id: 2041 }, headers: { Authorization: "Bearer captured-owner" }, signal,
  });
  expect(mock.unsubscribe).toHaveBeenCalledOnce();
});
it.each(["wallet_refund", "replacement_vend", "manual_review"] as const)("sends the exact %s contract without client money", async resolution => {
  const change = { ...input, resolution, anotherLoadCompleted: resolution === "wallet_refund", ...(resolution === "replacement_vend" ? { replacementMachineId: 12 } : {}) };
  mock.invoke.mockResolvedValue({ data: machineIssueResult(change), error: null });
  const signal = new AbortController().signal;
  await adminApi.resolveMachineIssue(caller, { ...change, amountCents: 999999, actor: other } as MachineIssueResolutionInput, signal);
  expect(mock.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "resolveMachineIssue", ...change }, headers: { Authorization: "Bearer captured-owner" }, signal,
  });
});
it("recovers a manual review only through a caller-bound status read", async () => {
  const result = machineIssueResult({ ...input, resolution: "manual_review" });
  mock.invoke.mockResolvedValue({ data: result.review, error: null });
  expect(await adminApi.machineIssueReview(caller, 2041, requestId)).toEqual(result.review);
  expect(mock.invoke.mock.calls[0][1].body).toEqual({ action: "machineIssueReview", id: 2041, requestId });
});
it.each(["pending", "support_required"] as const)("retains truthful %s financial receipts", async state => {
  const result = machineIssueResult(input, state);
  mock.invoke.mockResolvedValue({ data: result, error: null });
  expect((await adminApi.resolveMachineIssue(caller, input)).review.receipt?.state).toBe(state);
  expect(mock.invoke).toHaveBeenCalledOnce();
});
it.each([
  { ...machineIssueFixture, refundId: 2 },
  { ...machineIssueFixture, amountCents: 3.5 },
  { ...machineIssueFixture, paidAmountCents: 350 },
  { ...machineIssueFixture, replacementMachines: [{ id: 12, name: "Wrong price", amountCents: 400 }] },
  { ...machineIssueFixture, replacementMachines: [...machineIssueFixture.replacementMachines, ...machineIssueFixture.replacementMachines] },
  { ...machineIssueFixture, receipt: { requestId: other, resolution: "manual_review", state: "recorded" } },
  { ...machineIssueFixture, capabilities: { walletRefund: "yes", replacementVend: true } },
])("rejects malformed or mismatched server review %#", async review => {
  mock.invoke.mockResolvedValue({ data: review, error: null });
  await expect(adminApi.machineIssueReview(caller, 2041, requestId)).rejects.toThrow("could not be verified");
  expect(mock.invoke).toHaveBeenCalledOnce();
});
it("accepts explicitly unknown provenance without inventing eligibility", async () => {
  const review = { ...machineIssueFixture, amountCents: null, paidAmountCents: null, promoAmountCents: null,
    locationId: null, locationTimezone: null, transactionAt: null, sameDayEligible: false,
    capabilities: { walletRefund: false, replacementVend: false }, replacementMachines: [] };
  mock.invoke.mockResolvedValue({ data: review, error: null });
  expect(await adminApi.machineIssueReview(caller, 2041)).toEqual(review);
});
it.each([
  { ...input, atLocation: false }, { ...input, anotherLoadCompleted: false },
  { ...input, note: " " }, { ...input, requestId: "bad" },
  { ...input, resolution: "replacement_vend" as const, anotherLoadCompleted: false },
  { ...input, resolution: "replacement_vend" as const, replacementMachineId: 12 },
])("rejects invalid resolution before transport %#", async change => {
  await expect(adminApi.resolveMachineIssue(caller, change)).rejects.toMatchObject({ code: "invalid_request" });
  expect(mock.invoke).not.toHaveBeenCalled();
});
it.each([null, { requestId: other, resolution: "wallet_refund", state: "completed" },
  { requestId, resolution: "replacement_vend", state: "completed" }])("rejects missing or mismatched mutation receipts %#", async receipt => {
  const result = machineIssueResult(input);
  mock.invoke.mockResolvedValue({ data: { ...result, review: { ...result.review, receipt } }, error: null });
  await expect(adminApi.resolveMachineIssue(caller, input)).rejects.toThrow("unconfirmed");
  expect(mock.invoke).toHaveBeenCalledOnce();
});
it.each(["SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"])("discards late success after %s", async event => {
  mock.invoke.mockImplementation(async () => { authEvent(event); return { data: machineIssueResult(input), error: null }; });
  await expect(adminApi.resolveMachineIssue(caller, input)).rejects.toThrow("Admin session changed");
  expect(mock.invoke).toHaveBeenCalledOnce();
});
it("rejects a replaced caller before dispatch", async () => {
  mock.session.mockResolvedValue({ data: { session: { user: { id: other }, access_token: "other" } }, error: null });
  await expect(adminApi.resolveMachineIssue(caller, input)).rejects.toThrow("Admin session changed");
  expect(mock.invoke).not.toHaveBeenCalled();
});
it("never automatically retries an unavailable financial write", async () => {
  mock.invoke.mockRejectedValue(new Error("network"));
  await expect(adminApi.resolveMachineIssue(caller, input)).rejects.toThrow();
  expect(mock.invoke).toHaveBeenCalledOnce();
});
