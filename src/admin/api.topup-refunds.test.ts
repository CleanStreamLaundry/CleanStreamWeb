import { beforeEach, expect, it, vi } from "vitest";
import { adminApi } from "./api";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn(), unsubscribe: vi.fn(), listener: null as null | ((event: string) => void) }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mocks.getSession, onAuthStateChange: (listener: (event: string) => void) => {
    mocks.listener = listener; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  } }, functions: { invoke: mocks.invoke },
}) }));
const record = { id: "refund-1", load_id: "12", customer_id: "customer", status: "pending", principal_cents: 2000,
  bonus_reserved_cents: 500, currency: "usd", requested_at: "2026-09-30T12:00:00Z", payment_succeeded_at: "2026-09-30T11:00:00Z",
  reviewed_at: null, completed_at: null, policy_version: "unused-topup-v1", location_id: null, review_note: null };
beforeEach(() => {
  vi.clearAllMocks(); mocks.listener = null;
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "owner" }, access_token: "initiating-bearer" } }, error: null });
  mocks.invoke.mockResolvedValue({ data: { data: record }, error: null });
});
it("pins initiating bearer and forwards only the review contract; pending remains pending", async () => {
  const signal = new AbortController().signal;
  expect((await adminApi.reviewTopupRefund("owner", record.id, "approve", "Checked", signal)).status).toBe("pending");
  expect(mocks.invoke).toHaveBeenCalledWith("voluntary-topup-refund", {
    body: { action: "approve", id: record.id, note: "Checked" }, headers: { Authorization: "Bearer initiating-bearer" }, signal,
  });
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});
it("forwards both cursor components without inventing pagination totals", async () => {
  mocks.invoke.mockResolvedValue({ data: { data: [record] }, error: null });
  const cursor = { before: record.requested_at, before_id: record.id };
  expect(await adminApi.topupRefunds("owner", cursor)).toEqual([record]);
  expect(mocks.invoke.mock.calls[0]![1].body).toEqual({ action: "list", ...cursor });
});
it.each(["mismatch", "signed_out", "a-b-a", "aborted"])("does not dispatch when %s occurs before session resolution", async (mode) => {
  const controller = new AbortController();
  mocks.getSession.mockImplementation(async () => {
    if (mode === "signed_out") mocks.listener!("SIGNED_OUT");
    if (mode === "a-b-a") { mocks.listener!("SIGNED_IN"); mocks.listener!("SIGNED_IN"); }
    if (mode === "aborted") controller.abort();
    return { data: { session: { user: { id: mode === "mismatch" ? "other" : "owner" }, access_token: "secret" } }, error: null };
  });
  await expect(adminApi.reviewTopupRefund("owner", record.id, "approve", "", controller.signal)).rejects.toThrow("Owner session changed");
  expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});
it("discards an already-dispatched response after account change", async () => {
  mocks.invoke.mockImplementation(async () => { mocks.listener!("SIGNED_OUT"); return { data: { data: record }, error: null }; });
  await expect(adminApi.reviewTopupRefund("owner", record.id, "approve", "")).rejects.toThrow("Owner session changed");
});
it("503 uncertainty preserves explicit reconciliation guidance", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "refund_outcome_unknown", reconciliation_required: true }), { status: 503 }) } });
  await expect(adminApi.reviewTopupRefund("owner", record.id, "approve", "")).rejects.toThrow(/unconfirmed.*reconcile.*must not be released manually/);
});
it.each(["session_invalid", "owner_or_location_forbidden", "refund_conflict"])("handles authoritative server rejection %s", async (code) => {
  mocks.invoke.mockResolvedValue({ data: { error: code }, error: null });
  await expect(adminApi.reviewTopupRefund("owner", record.id, "approve", "")).rejects.toThrow();
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
it.each([{ ...record, id: "other" }, { ...record, principal_cents: 20.5 }, { ...record, status: "paid" }, {}])("rejects invalid or mismatched mutation results", async (row) => {
  mocks.invoke.mockResolvedValue({ data: { data: row }, error: null });
  await expect(adminApi.reviewTopupRefund("owner", record.id, "approve", "")).rejects.toThrow("unconfirmed");
});
it("rejects duplicate list IDs", async () => {
  mocks.invoke.mockResolvedValue({ data: { data: [record, record] }, error: null });
  await expect(adminApi.topupRefunds("owner", null)).rejects.toThrow("Invalid refund history");
});
