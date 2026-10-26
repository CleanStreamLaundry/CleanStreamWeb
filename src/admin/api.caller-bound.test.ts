// @vitest-environment node
import { Buffer } from "node:buffer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { adminApi } from "./api";

const singleton = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => {
  if (!singleton.client) throw new Error("Missing test client");
  return singleton.client;
} }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function session(id: string) {
  const expires_at = 4102444800;
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: expires_at, aal: "aal2" })).toString("base64url");
  return {
    access_token: `e30.${payload}.synthetic`, refresh_token: `${id}-refresh`,
    token_type: "bearer", expires_in: 3600, expires_at,
    user: { id, aud: "authenticated", role: "authenticated", email: `${id}@example.invalid`,
      app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

it("real SDK's deferred dispatch lookup cannot substitute B for captured caller A", async () => {
  const origin = "https://admin-caller.invalid";
  const key = "admin-caller-bound-test";
  const values = new Map([[key, JSON.stringify(session("A"))]]);
  const requests: Array<{ bearer: string | null; body: unknown }> = [];
  const fakeHttp: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) throw new Error("Unexpected network destination");
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      return Response.json(session("B"));
    }
    if (url.pathname === "/functions/v1/admin-portal") {
      requests.push({ bearer: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true });
    }
    throw new Error(`Unexpected fake HTTP route: ${url.pathname}`);
  };
  const client = createClient(origin, "synthetic-anon-key", {
    global: { fetch: fakeHttp },
    auth: { storageKey: key, autoRefreshToken: false, detectSessionInUrl: false,
      storage: {
        getItem: (name) => values.get(name) ?? null,
        setItem: (name, value) => { values.set(name, value); },
        removeItem: (name) => { values.delete(name); },
      },
    },
  });
  singleton.client = client;
  const dispatchLookup = deferred<void>();
  const release = deferred<void>();
  const readSession = client.auth.getSession.bind(client.auth);
  let pending: Promise<void> | undefined;
  try {
    expect((await client.auth.initialize()).error).toBeNull();
    vi.spyOn(client.auth, "getSession")
      .mockImplementationOnce(readSession)
      .mockImplementationOnce(async () => {
        dispatchLookup.resolve();
        await release.promise;
        return readSession();
      });
    pending = adminApi.deleteMachine(17);
    await dispatchLookup.promise;
    expect((await client.auth.signInWithPassword({ email: "B@example.invalid", password: "synthetic" })).error).toBeNull();
    release.resolve();
    await expect(pending).rejects.toThrow("Admin session changed");
    expect(requests).toEqual([{ bearer: `Bearer ${session("A").access_token}`, body: { action: "deleteMachine", id: 17 } }]);
    expect((await readSession()).data.session?.user.id).toBe("B");
  } finally {
    release.resolve();
    await pending?.catch(() => {});
    vi.restoreAllMocks();
    await client.auth.stopAutoRefresh();
    await client.realtime.disconnect();
    singleton.client = null;
  }
});
