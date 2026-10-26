// @vitest-environment node
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { maintenanceAttachmentAttempt } from "./maintenanceAttachment";

const mocks = vi.hoisted(() => ({ session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), rpc: vi.fn(), header: vi.fn(), signal: vi.fn(), fetch: vi.fn() }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: mocks.session, onAuthStateChange: mocks.subscribe }, rpc: mocks.rpc,
}) }));
const maintId = "9223372036854775807";
const descriptor = {
  maint_id: maintId,
  attachment: { bucket: "maintenance-images", id: "00000000-0000-4000-8000-000000000001", name: "requests/photo #1.png", version: "version-1" },
};
let authEvent: (event: AuthChangeEvent) => void;
let run: ReturnType<typeof maintenanceAttachmentAttempt> | undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function rpcReply(value: Promise<unknown>) {
  const builder = Object.assign(value, { setHeader: mocks.header, abortSignal: mocks.signal });
  mocks.header.mockReturnValue(builder);
  mocks.signal.mockReturnValue(builder);
  mocks.rpc.mockReturnValue(builder);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.invalid");
  vi.stubEnv("VITE_ANON_KEY", "synthetic-public-key");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.session.mockResolvedValue({ data: { session: { access_token: "captured-A", user: { id: "A" } } }, error: null });
  mocks.subscribe.mockImplementation((callback: typeof authEvent) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  rpcReply(Promise.resolve({ data: descriptor, error: null }));
  mocks.fetch.mockResolvedValue(new Response(new Blob(["synthetic image"], { type: "image/png" })));
});
afterEach(() => { run?.close(); run = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function start(id = maintId) {
  const invalidated = vi.fn();
  run = maintenanceAttachmentAttempt(id, "A", invalidated);
  return { run, invalidated };
}

it("preserves bigint text and pins both RPC and encoded private download to A", async () => {
  const { run } = start();
  const blob = await run.download();
  expect(blob.type).toBe("image/png");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_maintenance_attachment", { p_maint_id: maintId });
  expect(mocks.header).toHaveBeenCalledExactlyOnceWith("Authorization", "Bearer captured-A");
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("https://project.invalid/storage/v1/object/maintenance-images/requests/photo%20%231.png", {
    headers: { apikey: "synthetic-public-key", Authorization: "Bearer captured-A" },
    signal: expect.any(AbortSignal), cache: "no-store", credentials: "omit", redirect: "error",
  });
});
it.each(["0", "9223372036854775808", "1/../../evil"])("rejects invalid report ID %s before session/RPC", async (id) => {
  const { run } = start(id);
  await expect(run.download()).rejects.toThrow("unavailable");
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([
  { ...descriptor, maint_id: "different" },
  { ...descriptor, attachment: { ...descriptor.attachment, bucket: "public" } },
  { ...descriptor, attachment: { ...descriptor.attachment, name: "requests/../private.png" } },
  { ...descriptor, attachment: { ...descriptor.attachment, name: "https://untrusted.invalid/evidence.png" } },
  { ...descriptor, attachment: { ...descriptor.attachment, id: "invalid" } },
])("rejects malformed or mismatched descriptor %# without fetching", async (data) => {
  rpcReply(Promise.resolve({ data, error: null }));
  const { run } = start();
  await expect(run.download()).rejects.toThrow("unavailable");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("does not fall back to a legacy URL after RPC denial", async () => {
  rpcReply(Promise.resolve({ data: null, error: { code: "PT404", message: "attachment_unavailable" } }));
  const { run } = start();
  await expect(run.download()).rejects.toThrow("unavailable");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("rejects a caller mismatch before RPC", async () => {
  mocks.session.mockResolvedValue({ data: { session: { access_token: "B", user: { id: "B" } } }, error: null });
  const { run } = start();
  await expect(run.download()).rejects.toThrow("session changed");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("stops after replacement during deferred descriptor lookup", async () => {
  const pending = deferred<unknown>();
  const started = deferred<void>();
  rpcReply(pending.promise);
  mocks.signal.mockImplementation(() => { started.resolve(); return pending.promise; });
  const { run, invalidated } = start();
  const result = run.download();
  await started.promise;
  authEvent("SIGNED_IN");
  pending.resolve({ data: descriptor, error: null });
  await expect(result).rejects.toThrow("session changed");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(invalidated).toHaveBeenCalledOnce();
  expect(run.current()).toBe(false);
});
it("aborts on close and discards a blob which ignores the abort", async () => {
  const started = deferred<void>();
  const body = deferred<Blob>();
  const response = new Response("placeholder");
  vi.spyOn(response, "blob").mockImplementation(() => { started.resolve(); return body.promise; });
  mocks.fetch.mockResolvedValue(response);
  const { run, invalidated } = start();
  const result = run.download();
  await started.promise;
  run.close();
  expect(mocks.fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  body.resolve(new Blob(["late"], { type: "image/png" }));
  await expect(result).rejects.toThrow("session changed");
  authEvent("SIGNED_OUT");
  expect(invalidated).not.toHaveBeenCalled();
});
it("allows token refresh without choosing a new download bearer", async () => {
  mocks.header.mockImplementation(() => {
    authEvent("TOKEN_REFRESHED");
    return { abortSignal: () => Promise.resolve({ data: descriptor, error: null }) };
  });
  await start().run.download();
  expect(mocks.fetch.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer captured-A");
});
it.each(["text/html", "image/svg+xml"])("does not render active content %s", async (type) => {
  mocks.fetch.mockResolvedValue(new Response(new Blob(["untrusted"], { type })));
  await expect(start().run.download()).rejects.toThrow("not a supported image");
});
