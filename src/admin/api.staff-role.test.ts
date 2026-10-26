import { beforeEach, expect, it, vi } from "vitest";
import { staffRoleApi } from "./api";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mocks.session, onAuthStateChange: mocks.subscribe }, functions: { invoke: mocks.invoke },
}) }));
const caller = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const input = { userId: target, portalRole: "Maintenance" as const, expectedPortalRole: "Manager" as const, requestId, note: "Maintenance assignment" };
const receipt = { userId: target, portalRole: "Maintenance", requestId, changed: true };
let authEvent: (event: string) => void;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { user: { id: caller }, access_token: "captured-A" } }, error: null });
  mocks.subscribe.mockImplementation((callback: typeof authEvent) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
it("binds one staff role change to the initiating Owner session", async () => {
  mocks.invoke.mockResolvedValue({ data: receipt, error: null });
  const signal = new AbortController().signal;
  expect(await staffRoleApi.setRole(caller, input, signal)).toEqual(receipt);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "setStaffRole", ...input }, headers: { Authorization: "Bearer captured-A" }, signal,
  });
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("rejects self changes and invalid references before dispatch", async () => {
  await expect(staffRoleApi.setRole(caller, { ...input, userId: caller }, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_request" });
  await expect(staffRoleApi.status(caller, "invalid", new AbortController().signal)).rejects.toMatchObject({ code: "invalid_request" });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it.each([
  { ...receipt, userId: caller }, { ...receipt, requestId: target }, { ...receipt, portalRole: "Owner" },
])("rejects a mismatched receipt without retrying", async result => {
  mocks.invoke.mockResolvedValue({ data: result, error: null });
  await expect(staffRoleApi.setRole(caller, input, new AbortController().signal)).rejects.toThrow("unconfirmed");
  expect(mocks.invoke).toHaveBeenCalledOnce();
});
it("discards late success after account replacement", async () => {
  mocks.invoke.mockImplementation(async () => { authEvent("SIGNED_IN"); return { data: receipt, error: null }; });
  await expect(staffRoleApi.setRole(caller, input, new AbortController().signal)).rejects.toThrow("Admin session changed");
  expect(mocks.invoke).toHaveBeenCalledOnce();
});
it.each(["not_found", "completed"] as const)("reconciles %s without replaying the role change", async state => {
  const result = state === "not_found" ? { state } : { state, result: receipt };
  mocks.invoke.mockResolvedValue({ data: result, error: null });
  const signal = new AbortController().signal;
  expect(await staffRoleApi.status(caller, requestId, signal)).toEqual(result);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "staffRoleStatus", requestId }, headers: { Authorization: "Bearer captured-A" }, signal,
  });
});
