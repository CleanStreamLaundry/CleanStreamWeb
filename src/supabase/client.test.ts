import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Real installed SDK/localStorage, fake HTTP only. These DOM tests do not prove
// browser Web Locks/BroadcastChannel isolation or candidate refresh correctness.
const clients: SupabaseClient[] = [];
const initialUrl = "https://project.supabase.invalid";
const legacyKey = "sb-project-auth-token";
const coordinatedKey = "sb-project.supabase.invalid-auth-token-coordinated-v2";
function session(id: string) {
    const exp = 4102444800;
    const payload = Buffer.from(JSON.stringify({ sub: id, exp, aal: "aal1" })).toString("base64url");
    return {
        access_token: `e30.${payload}.synthetic`, refresh_token: `${id}-refresh`,
        token_type: "bearer", expires_in: 3600, expires_at: exp,
        user: { id, aud: "authenticated", role: "authenticated", app_metadata: {},
            user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    };
}
const fakeHttp = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (!url.hostname.endsWith(".invalid")) throw new Error("Unexpected network destination");
    if (url.pathname.endsWith("/auth/v1/token") && url.searchParams.get("grant_type") === "password") {
        return Response.json(session("new-login"));
    }
    if (url.pathname.endsWith("/auth/v1/logout")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected fake HTTP route: ${url.pathname}`);
});
async function loadClient() {
    const module = await import("./client");
    if (module.supabase) {
        clients.push(module.supabase);
        await module.supabase.auth.initialize();
    }
    return module;
}
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", initialUrl);
    vi.stubEnv("VITE_ANON_KEY", "synthetic-public-key");
    vi.stubGlobal("fetch", fakeHttp);
    // No native channels or browser coordination is exercised by this test.
    vi.stubGlobal("BroadcastChannel", undefined);
    localStorage.clear();
});
afterEach(async () => {
    for (const client of clients.splice(0)) await client.auth.stopAutoRefresh();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
});
it.each([
    ["", "synthetic-public-key"],
    [initialUrl, ""],
    ["", ""],
])("preserves missing-config null client (%s, %s)", async (url, key) => {
    vi.stubEnv("VITE_SUPABASE_URL", url);
    vi.stubEnv("VITE_ANON_KEY", key);
    const module = await loadClient();
    expect(module.supabase).toBeNull();
    expect(module.getSupabaseClient).toThrow("Supabase client not initialized. Check your environment variables.");
    expect(fakeHttp).not.toHaveBeenCalled();
});
it("does not parse a URL when the public key is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "not-a-url");
    vi.stubEnv("VITE_ANON_KEY", "");
    expect((await loadClient()).supabase).toBeNull();
    expect(fakeHttp).not.toHaveBeenCalled();
});
it("starts fresh without reading, copying or clearing legacy credentials", async () => {
    const legacy = {
        [legacyKey]: JSON.stringify(session("legacy")),
        [`${legacyKey}-user`]: JSON.stringify({ user: session("legacy").user }),
        [`${legacyKey}-code-verifier`]: JSON.stringify("legacy-verifier"),
    };
    for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    const module = await loadClient();
    const client = module.getSupabaseClient();
    expect(client).toBe(module.supabase);
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(localStorage.getItem(coordinatedKey)).toBeNull();
    expect(fakeHttp).not.toHaveBeenCalled();
    expect((await client.auth.signInWithPassword({ email: "staff@example.invalid", password: "synthetic" })).error).toBeNull();
    expect(JSON.parse(localStorage.getItem(coordinatedKey)!).user.id).toBe("new-login");
    expect((await client.auth.signOut({ scope: "local" })).error).toBeNull();
    expect(localStorage.getItem(coordinatedKey)).toBeNull();
    for (const key of Object.keys(legacy)) {
        expect(read.mock.calls.some(([name]) => name === key)).toBe(false);
        expect(write.mock.calls.some(([name]) => name === key)).toBe(false);
        expect(remove.mock.calls.some(([name]) => name === key)).toBe(false);
    }
    expect(clear).not.toHaveBeenCalled();
    for (const [key, value] of Object.entries(legacy)) expect(localStorage.getItem(key)).toBe(value);
});
it.each([
    ["https://PROJECT.supabase.invalid/", coordinatedKey],
    ["https://project.other.invalid:8443/", "sb-project.other.invalid:8443-auth-token-coordinated-v2"],
])("scopes the stable protocol domain to the configured host: %s", async (url, key) => {
    vi.stubEnv("VITE_SUPABASE_URL", url);
    const client = (await loadClient()).getSupabaseClient();
    expect((await client.auth.signInWithPassword({ email: "staff@example.invalid", password: "synthetic" })).error).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!).user.id).toBe("new-login");
    expect(localStorage.getItem(legacyKey)).toBeNull();
});
it("restores only the new domain and ignores a later legacy-domain write", async () => {
    const client = (await loadClient()).getSupabaseClient();
    expect((await client.auth.signInWithPassword({ email: "staff@example.invalid", password: "synthetic" })).error).toBeNull();
    await client.auth.stopAutoRefresh();
    localStorage.setItem(legacyKey, JSON.stringify(session("late-legacy")));
    vi.resetModules();
    const reloaded = (await loadClient()).getSupabaseClient();
    expect((await reloaded.auth.getSession()).data.session?.user.id).toBe("new-login");
    expect(JSON.parse(localStorage.getItem(legacyKey)!).user.id).toBe("late-legacy");
});
