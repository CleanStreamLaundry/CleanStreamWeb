import { beforeEach, expect, it, vi } from "vitest";
import { adminApi, invoke } from "./api";
import { AdminAdmissionError, mfaStep } from "./admission";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import type { CortinaMachineConfig } from "./types";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mocks.session, onAuthStateChange: mocks.subscribe }, functions: { invoke: mocks.invoke },
}) }));
let authEvent: (event: AuthChangeEvent) => void;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { access_token: "captured-A" } }, error: null });
  mocks.subscribe.mockImplementation((callback: typeof authEvent) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
it.each(["enroll_totp", "challenge_totp"])("preserves the caller-bound %s denial", async (step) => {
  mocks.invoke.mockResolvedValue({ data: null, error: { context: Response.json({ error: "MFA required", code: step, next_step: step }, { status: 403 }) } });
  const error: unknown = await adminApi.identity().catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(AdminAdmissionError);
  expect(mfaStep(error)).toBe(step);
  expect(mocks.invoke).toHaveBeenCalledWith("admin-portal", { body: { action: "identity" }, headers: { Authorization: "Bearer captured-A" } });
});
it("does not turn unrelated or inconsistent errors into MFA admission", () => {
  expect(mfaStep(new Error("enroll_totp"))).toBeNull();
  expect(mfaStep(new AdminAdmissionError("denied", "account_restricted", "enroll_totp"))).toBeNull();
  expect(mfaStep(new AdminAdmissionError("denied", "enroll_totp", "challenge_totp"))).toBeNull();
});
it("does not invoke identity without a signed-in caller", async () => {
  mocks.session.mockResolvedValue({ data: { session: null }, error: null });
  await expect(adminApi.identity()).rejects.toMatchObject({ code: "session_invalid" });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it("preserves the normal business invocation shape", async () => {
  mocks.invoke.mockResolvedValue({ data: { rows: [] }, error: null });
  await invoke("overview");
  expect(mocks.invoke).toHaveBeenCalledWith("admin-portal", { body: { action: "overview" } });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const location = { Name: "Test", Address: "Test", Latitude: 0, Longitude: 0 };
const machine = { Name: "Test", Price: 1, Runtime: 1, Status: "available", Location_ID: 1, Machine_type: "washer", Weight_kg: 1 };
const rate = { id: 1, location_id: 1, size_label: "Test", capacity_kg: 1, price_cents: 100, is_active: true, review_required: false };
const config: CortinaMachineConfig = { machine_id: 1, nayax_terminal_id: null, nayax_uniqr: null, pulse_line_number: null, environment: "sandbox", is_enabled: false, review_required: true };
const mutations: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
  ["setAvailability", () => adminApi.setAvailability(1, true, "test", "version"), { id: 1, outOfService: true, reason: "test", expectedUpdatedAt: "version" }],
  ["createLocation", () => adminApi.createLocation(location), { input: location }],
  ["createMachine", () => adminApi.createMachine(machine), { input: machine }],
  ["deleteMachine", () => adminApi.deleteMachine(1), { id: 1 }],
  ["saveRate", () => adminApi.saveRate(rate), { rate }],
  ["saveConfig", () => adminApi.saveConfig(config), { config }],
  ["updateMaintenance", () => adminApi.updateMaintenance("m", "resolved", "done", "version", { priority: "high", assignedTo: null, dueDate: null }), { id: "m", status: "resolved", note: "done", expectedUpdatedAt: "version", priority: "high", assignedTo: null, dueDate: null }],
  ["resolveCredit", () => adminApi.resolveCredit(1, "approved", "test"), { id: 1, decision: "approved", note: "test" }],
  ["invite", () => adminApi.invite("test@example.invalid", [1]), { email: "test@example.invalid", locationIds: [1], portalRole: "Manager" }],
  ["resend", () => adminApi.resend("user", 1), { userId: "user", locationId: 1 }],
  ["removeMember", () => adminApi.removeMember("user", 1), { userId: "user", locationId: 1 }],
];
it.each(mutations)("pins %s while preserving its body and return value", async (action, call, input) => {
  const result = { warning: "unchanged", notificationWarning: "unchanged", ...location, id: 1 };
  mocks.invoke.mockResolvedValue({ data: result, error: null });
  expect(await call()).toBe(result);
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("admin-portal", {
    body: { action, ...input }, headers: { Authorization: "Bearer captured-A" },
  });
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it.each(["SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"] as const)("rejects %s during deferred session capture without dispatch", async (event) => {
  const read = deferred<unknown>();
  mocks.session.mockReturnValue(read.promise);
  const pending = adminApi.deleteMachine(1);
  authEvent(event);
  read.resolve({ data: { session: { access_token: "replacement-B" } }, error: null });
  await expect(pending).rejects.toThrow("Admin session changed");
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it.each(["absent", "error"])("rejects an %s session without dispatch", async (kind) => {
  mocks.session.mockResolvedValue({ data: { session: null }, error: kind === "error" ? new Error("read failed") : null });
  await expect(adminApi.deleteMachine(1)).rejects.toMatchObject({ code: "session_invalid" });
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("allows same-session token refresh and INITIAL_SESSION without changing the captured bearer", async () => {
  mocks.invoke.mockImplementation(async () => {
    authEvent("INITIAL_SESSION");
    authEvent("TOKEN_REFRESHED");
    return { data: { warning: "preserved" }, error: null };
  });
  expect(await adminApi.invite("test@example.invalid", [1])).toEqual({ warning: "preserved" });
  expect(mocks.invoke.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer captured-A");
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("rejects late success after replacement without replaying the mutation", async () => {
  const started = deferred<void>();
  const reply = deferred<unknown>();
  mocks.invoke.mockImplementation(() => { started.resolve(); return reply.promise; });
  const pending = adminApi.deleteMachine(1);
  await started.promise;
  authEvent("SIGNED_IN");
  reply.resolve({ data: { success: true }, error: null });
  await expect(pending).rejects.toThrow("Admin session changed");
  expect(mocks.invoke).toHaveBeenCalledOnce();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("discards departed-caller admission errors even when replacement occurs during body parsing", async () => {
  const started = deferred<void>();
  const body = deferred<unknown>();
  const response = Response.json({});
  vi.spyOn(response, "json").mockImplementation(() => { started.resolve(); return body.promise; });
  mocks.invoke.mockResolvedValue({ data: null, error: { context: response } });
  const pending = adminApi.deleteMachine(1);
  await started.promise;
  authEvent("SIGNED_OUT");
  body.resolve({ error: "MFA required", code: "challenge_totp", next_step: "challenge_totp" });
  const error: unknown = await pending.catch((failure: unknown) => failure);
  expect(error).toEqual(expect.objectContaining({ message: expect.stringContaining("Admin session changed") }));
  expect(mfaStep(error)).toBeNull();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("preserves current-caller admission errors and cleans up on transport rejection", async () => {
  mocks.invoke.mockResolvedValueOnce({ data: null, error: { context: Response.json({ error: "MFA required", code: "challenge_totp", next_step: "challenge_totp" }) } });
  await expect(adminApi.deleteMachine(1)).rejects.toMatchObject({ code: "challenge_totp" });
  const failure = new Error("transport failed");
  mocks.invoke.mockRejectedValueOnce(failure);
  await expect(adminApi.deleteMachine(1)).rejects.toBe(failure);
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
});
