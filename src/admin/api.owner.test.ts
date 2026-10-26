import { beforeEach, expect, it, vi } from "vitest";
import { ownerManagementApi } from "./api";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mocks.session, onAuthStateChange: mocks.subscribe }, functions: { invoke: mocks.invoke },
}) }));
const caller = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const input = { userId: target, owner: true, expectedRole: "Admin" as const, requestId, note: "Approved additional Owner" };
const receipt = { userId: target, role: "Owner", requestId, changed: true };
let authEvent: (event: string) => void;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { user: { id: caller }, access_token: "captured-A" } }, error: null });
  mocks.subscribe.mockImplementation((callback: typeof authEvent) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});

it("sends exact existing-account lookup with captured bearer and signal", async () => {
  const result = { items: [{ userId: target, name: null, email: "target@example.invalid", role: "User", locationIds: [], ownerEligible: true, restriction: null }], page: 1, pageSize: 25, total: 1, activeOwnerCount: 2 };
  mocks.invoke.mockResolvedValue({ data: result, error: null });
  const signal = new AbortController().signal;
  expect(await ownerManagementApi.accounts(caller, "target@example.invalid", 1, signal)).toEqual(result);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "ownerAccounts", query: "target@example.invalid", page: 1 }, headers: { Authorization: "Bearer captured-A" }, signal,
  });
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it.each([true, false])("sends one confirmed role change, owner=%s", async owner => {
  const change = { ...input, owner, expectedRole: owner ? "Admin" as const : "Owner" as const };
  const result = { ...receipt, role: owner ? "Owner" : "Admin" };
  mocks.invoke.mockResolvedValue({ data: result, error: null });
  const signal = new AbortController().signal;
  expect(await ownerManagementApi.setOwner(caller, change, signal)).toEqual(result);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "setOwner", ...change }, headers: { Authorization: "Bearer captured-A" }, signal,
  });
});

it("rejects self changes before dispatch", async () => {
  await expect(ownerManagementApi.setOwner(caller, { ...input, userId: caller }, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_request" });
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("preserves last-owner error without retrying", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { context: Response.json({ error: "Last Owner", code: "owner_last_required" }, { status: 409 }) } });
  await expect(ownerManagementApi.setOwner(caller, input, new AbortController().signal)).rejects.toMatchObject({ code: "owner_last_required" });
  expect(mocks.invoke).toHaveBeenCalledOnce();
});

it("rejects a replacement caller before dispatch", async () => {
  mocks.session.mockResolvedValue({ data: { session: { user: { id: target }, access_token: "B" } }, error: null });
  await expect(ownerManagementApi.setOwner(caller, input, new AbortController().signal)).rejects.toThrow("Admin session changed");
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("discards late success after an auth replacement without replay", async () => {
  mocks.invoke.mockImplementation(async () => { authEvent("SIGNED_IN"); return { data: receipt, error: null }; });
  await expect(ownerManagementApi.setOwner(caller, input, new AbortController().signal)).rejects.toThrow("Admin session changed");
  expect(mocks.invoke).toHaveBeenCalledOnce();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it.each(["not_found", "completed"] as const)("reconciles %s through a read-only request-ID action", async state => {
  const result = state === "not_found" ? { state } : { state, result: receipt };
  mocks.invoke.mockResolvedValue({ data: result, error: null });
  const signal = new AbortController().signal;
  expect(await ownerManagementApi.status(caller, requestId, signal)).toEqual(result);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action: "ownerChangeStatus", requestId }, headers: { Authorization: "Bearer captured-A" }, signal,
  });
});

it("treats a wrong-target receipt as unconfirmed", async () => {
  mocks.invoke.mockResolvedValue({ data: { ...receipt, userId: caller }, error: null });
  await expect(ownerManagementApi.setOwner(caller, input, new AbortController().signal)).rejects.toThrow("unconfirmed");
  expect(mocks.invoke).toHaveBeenCalledOnce();
});

it("rejects a malformed account list before offering authority", async () => {
  mocks.invoke.mockResolvedValue({ data: { items: [{}], page: 1, pageSize: 25, total: 1, activeOwnerCount: 1 }, error: null });
  await expect(ownerManagementApi.accounts(caller, "", 1, new AbortController().signal)).rejects.toThrow("could not be verified");
});
