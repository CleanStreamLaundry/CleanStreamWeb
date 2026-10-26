import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { customerMfaRecoveryApi, CustomerMfaRecoveryError } from "./api";

const mock = vi.hoisted(() => ({ client: null as unknown, getSession: vi.fn(), invoke: vi.fn(), unsubscribe: vi.fn(), listener: (event: string) => { void event; } }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => mock.client }));
const owner = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const recovery = "33333333-3333-4333-8333-333333333333";
const session = (id = owner, token = "original-owner-bearer") => ({ access_token: token, user: { id } }) as Session;
const receipt = { target_user_id: target, recovery_id: null, support_case: null, state: "not_started", reenrollment_required: false };
const pending = { ...receipt, recovery_id: recovery, support_case: "CASE-123", state: "removal_pending", reenrollment_required: true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const inspect = (signal = new AbortController().signal) => customerMfaRecoveryApi.inspect(owner, target, signal);
const recover = () => customerMfaRecoveryApi.recover(owner, target, "CASE-123", true, new AbortController().signal);

beforeEach(() => {
  vi.clearAllMocks();
  mock.getSession.mockResolvedValue({ data: { session: session() }, error: null });
  mock.invoke.mockResolvedValue({ data: receipt, error: null });
  mock.client = { auth: { getSession: mock.getSession, onAuthStateChange: (listener: typeof mock.listener) => {
    mock.listener = listener; return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
  } }, functions: { invoke: mock.invoke } };
});
afterEach(() => vi.restoreAllMocks());

describe("real pinned SDK / synthetic HTTP", () => {
  it("sends the original bearer and app apikey despite a later SDK session lookup", async () => {
    const requests: { url: string; headers: Headers; body: unknown }[] = [];
    const client: SupabaseClient = createClient("https://owner-recovery.invalid", "synthetic-public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "owner-recovery-offline-test" },
      global: { fetch: async (input, init) => {
        const url = String(input);
        if (url !== "https://owner-recovery.invalid/functions/v1/customer-mfa-recovery") throw new Error("Unexpected offline request");
        requests.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ ...pending, state: "reenrollment_required" }), { headers: { "Content-Type": "application/json" } });
      } },
    });
    await client.auth.initialize();
    vi.spyOn(client.auth, "getSession")
      .mockResolvedValueOnce({ data: { session: session() }, error: null })
      .mockResolvedValue({ data: { session: session("other-owner", "replacement-bearer") }, error: null });
    mock.client = client;
    try {
      const result = await recover();
      expect(result.state).toBe("reenrollment_required");
      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers.get("Authorization")).toBe("Bearer original-owner-bearer");
      expect(requests[0]?.headers.get("apikey")).toBe("synthetic-public-key");
      expect(requests[0]?.body).toEqual({ action: "recover", target_user_id: target, support_case: "CASE-123", identity_verified: true });
    } finally { await client.auth.stopAutoRefresh(); }
  });
});

describe("customer recovery transport", () => {
  it("inspects explicitly with original bearer, normalized UUID and abort signal", async () => {
    const signal = new AbortController().signal;
    expect(await customerMfaRecoveryApi.inspect(owner, ` ${target.toUpperCase()} `, signal)).toEqual(receipt);
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith("customer-mfa-recovery", {
      body: { action: "inspect", target_user_id: target }, headers: { Authorization: "Bearer original-owner-bearer" }, signal,
    });
    expect(mock.unsubscribe).toHaveBeenCalledOnce();
  });
  it("trims the support case and sends no extra authority fields", async () => {
    mock.invoke.mockResolvedValue({ data: pending, error: null });
    await customerMfaRecoveryApi.recover(owner, target, " CASE-123 ", true, new AbortController().signal);
    expect(mock.invoke.mock.calls[0]?.[1].body).toEqual({ action: "recover", target_user_id: target, support_case: "CASE-123", identity_verified: true });
  });
  it.each(["invalid", owner])("rejects invalid/self target %s before dispatch", async (id) => {
    await expect(customerMfaRecoveryApi.inspect(owner, id, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_request" });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each(["", " ", "x".repeat(121), "CASE\n123", "CASE\x7f123"])("rejects invalid case %j", async (value) => {
    await expect(customerMfaRecoveryApi.recover(owner, target, value, true, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_request" });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("requires true external verification at runtime", async () => {
    await expect(customerMfaRecoveryApi.recover(owner, target, "CASE-123", false as true, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_request" });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each([null, session("other-owner"), session(owner, "")])("rejects missing or mismatched initiating session", async (value) => {
    mock.getSession.mockResolvedValue({ data: { session: value }, error: null });
    await expect(inspect()).rejects.toMatchObject({ code: "session_invalid" });
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.unsubscribe).toHaveBeenCalledOnce();
  });
  it("aborts before dispatch", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(inspect(controller.signal)).rejects.toMatchObject({ code: "session_changed" });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each(["SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"])("rejects %s while awaiting session", async (event) => {
    const wait = deferred<{ data: { session: Session }; error: null }>(); mock.getSession.mockReturnValue(wait.promise);
    const result = inspect(); const assertion = expect(result).rejects.toMatchObject({ code: "session_changed" });
    mock.listener(event); mock.listener("SIGNED_IN"); wait.resolve({ data: { session: session() }, error: null });
    await assertion; expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("ignores token refresh but not account replacement while awaiting response", async () => {
    const wait = deferred<{ data: typeof receipt; error: null }>(); mock.invoke.mockReturnValue(wait.promise);
    const result = inspect(); await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
    mock.listener("TOKEN_REFRESHED"); wait.resolve({ data: receipt, error: null });
    expect(await result).toEqual(receipt);
  });
  it.each(["account", "abort"])("discards late response after %s change", async (change) => {
    const wait = deferred<{ data: typeof receipt; error: null }>(); mock.invoke.mockReturnValue(wait.promise);
    const controller = new AbortController(); const result = inspect(controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ code: "session_changed" });
    await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
    if (change === "account") { mock.listener("SIGNED_OUT"); mock.listener("SIGNED_IN"); } else controller.abort();
    wait.resolve({ data: receipt, error: null }); await assertion;
    expect(mock.unsubscribe).toHaveBeenCalledOnce();
  });
  it("rechecks account after awaited error-body parsing", async () => {
    const wait = deferred<unknown>(); const response = new Response(); vi.spyOn(response, "json").mockReturnValue(wait.promise);
    mock.invoke.mockResolvedValue({ data: null, error: { context: response } });
    const result = inspect(); const assertion = expect(result).rejects.toMatchObject({ code: "session_changed" });
    await vi.waitFor(() => expect(response.json).toHaveBeenCalledOnce());
    mock.listener("SIGNED_OUT"); mock.listener("SIGNED_IN"); wait.resolve({ error: "fresh_sign_in_required" }); await assertion;
  });
  it.each(["invalid_request", "session_invalid", "recovery_forbidden", "fresh_sign_in_required", "recovery_conflict", "recovery_unavailable"])("maps %s without server diagnostics", async (code) => {
    mock.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: code, detail: "PRIVATE" })) } });
    await expect(inspect()).rejects.toEqual(new CustomerMfaRecoveryError(code as ConstructorParameters<typeof CustomerMfaRecoveryError>[0]));
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it.each(["throw", "unknown", "malformed"])("sanitizes %s failure with no retry", async (mode) => {
    if (mode === "throw") mock.invoke.mockRejectedValue(new Error("PRIVATE"));
    else mock.invoke.mockResolvedValue({ data: null, error: { context: new Response(mode === "unknown" ? '{"error":"PRIVATE"}' : "bad") } });
    await expect(recover()).rejects.toEqual(new CustomerMfaRecoveryError("recovery_unavailable"));
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it.each([
    null, { data: receipt }, { ...receipt, target_user_id: owner }, { ...receipt, state: "complete" },
    { ...receipt, reenrollment_required: true }, { ...receipt, recovery_id: recovery },
    { ...pending, recovery_id: null }, { ...pending, support_case: "" },
    { ...pending, reenrollment_required: false }, { ...pending, support_case: " CASE-123" },
  ])("rejects malformed/mismatched receipt %j", async (data) => {
    mock.invoke.mockResolvedValue({ data, error: null });
    await expect(inspect()).rejects.toMatchObject({ code: "recovery_unavailable" });
  });
  it.each([receipt, { ...pending, support_case: "DIFFERENT" }])("rejects recover receipt for absent/different case", async (data) => {
    mock.invoke.mockResolvedValue({ data, error: null });
    await expect(recover()).rejects.toMatchObject({ code: "recovery_unavailable" });
  });
  it("returns only public receipt fields", async () => {
    mock.invoke.mockResolvedValue({ data: { ...pending, remaining_factor_ids: ["PRIVATE"] }, error: null });
    expect(await inspect()).toEqual(pending);
  });
});
