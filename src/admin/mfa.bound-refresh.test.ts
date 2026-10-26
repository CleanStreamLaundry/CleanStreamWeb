// @vitest-environment node
import { GoTrueClient, processLock, type GoTrueClientOptions, type Session, type SupportedStorage } from "@supabase/auth-js";
import { Buffer } from "node:buffer";
import { setImmediate } from "node:timers";
import { describe, expect, it } from "vitest";
import { staffMfaAttempt } from "./mfa";

const origin = "https://staff-mfa.invalid";
let sequence = 0;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function session(id = "A", suffix = "initial", expired = false): Session {
  const exp = expired ? 1 : 4102444800;
  const payload = Buffer.from(JSON.stringify({ sub: id, aal: "aal2", exp })).toString("base64url");
  return {
    access_token: `e30.${payload}.${suffix}`, refresh_token: `${id}-${suffix}`,
    token_type: "bearer", expires_in: 3600, expires_at: exp,
    user: { id, aud: "authenticated", role: "authenticated", email: `${id}@example.invalid`,
      app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}
function fixture(Type: new (options: GoTrueClientOptions) => GoTrueClient = GoTrueClient, initial: ReturnType<typeof session> | null = session(), autoRefreshToken = false) {
  const key = `staff-bound-refresh-${++sequence}`;
  const values = new Map<string, string>(initial ? [[key, JSON.stringify(initial)]] : []);
  const storage: SupportedStorage = {
    getItem: async (name) => values.get(name) ?? null,
    setItem: async (name, value) => { values.set(name, value); },
    removeItem: async (name) => { values.delete(name); },
  };
  const refreshStarted = deferred<void>();
  const passwordStarted = deferred<void>();
  const requests: Array<{ path: string; body: string; bearer: string | null }> = [];
  let refreshReply: Promise<Response> | undefined;
  const fakeHttp: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) throw new Error("Unexpected network destination");
    const body = String(init?.body ?? "");
    requests.push({ path: url.pathname, body, bearer: new Headers(init?.headers).get("authorization") });
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      refreshStarted.resolve();
      return refreshReply ?? Response.json(session("A", "refreshed"));
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      passwordStarted.resolve();
      return Response.json(session((JSON.parse(body) as { email: string }).email.split("@")[0]!, "replacement"));
    }
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/auth/v1/user") return Response.json({ ...session().user, factors: [] });
    if (url.pathname === "/auth/v1/factors") return Response.json({ id: "totp-A", totp: { secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/CleanStream:test?secret=JBSWY3DPEHPK3PXP" } });
    if (url.pathname === "/auth/v1/factors/totp-A/challenge") return Response.json({ id: "challenge-A" });
    if (url.pathname === "/auth/v1/factors/totp-A/verify") return Response.json(session("A", "verified"));
    throw new Error(`Unexpected fake HTTP route: ${url.pathname}`);
  };
  const options = { url: `${origin}/auth/v1`, storageKey: key, storage, autoRefreshToken, detectSessionInUrl: false, fetch: fakeHttp, lock: processLock };
  const auth = new Type(options);
  return {
    auth, options, key, values, storage, requests, refreshStarted, passwordStarted, fakeHttp,
    holdRefresh() { const pending = deferred<Response>(); refreshReply = pending.promise; return pending; },
    close() { return auth.stopAutoRefresh(); },
  };
}
function bound(auth: GoTrueClient) { return auth; }
const expected = () => ({ refresh_token: "A-verified", expectedAccessToken: session().access_token, expectedUserId: "A" });

describe("installed patched SDK public semantics", () => {
  const Type = GoTrueClient;
  it("accepts a full external Session in ordinary refresh with empty storage", async () => {
    const h = fixture(Type, null);
    try {
      await h.auth.initialize();
      const result = await h.auth.refreshSession(session());
      expect(result.error).toBeNull();
      expect(result.data.session?.user.id).toBe("A");
    } finally { await h.close(); }
  });
  it("does not reject ordinary expired refresh's own success", async () => {
    const h = fixture(Type, session("A", "expired", true));
    try {
      await h.auth.initialize();
      const result = await h.auth.refreshSession();
      expect(result.error).toBeNull();
      expect(result.data.session?.refresh_token).toBe("A-refreshed");
    } finally { await h.close(); }
  });
  it("imports expired external setSession credentials without an existing copy", async () => {
    const h = fixture(Type, null);
    try {
      await h.auth.initialize();
      const result = await h.auth.setSession(session("A", "expired", true));
      expect(result.error).toBeNull();
      expect(result.data.session?.user.id).toBe("A");
    } finally { await h.close(); }
  });
  it("recovers an expired session without an opt-in cancellation path", async () => {
    const h = fixture(Type, session("A", "expired", true), true);
    try {
      expect((await h.auth.initialize()).error).toBeNull();
      expect((await h.auth.getSession()).data.session?.refresh_token).toBe("A-refreshed");
    } finally { await h.close(); }
  });
});

describe("opt-in caller-bound refresh", () => {
  it("completes raw TOTP enrollment/verification and adopts through the new API", async () => {
    const h = fixture();
    await h.auth.initialize();
    const run = staffMfaAttempt({ auth: h.auth }, session(), () => true, { url: origin, anonKey: "synthetic", fetch: h.fakeHttp });
    try {
      expect(run.supported()).toBe(true);
      expect(await run.factors()).toEqual([]);
      expect((await run.enroll()).id).toBe("totp-A");
      await run.verify("totp-A", "123456");
      expect((await h.auth.getSession()).data.session?.refresh_token).toBe("A-refreshed");
      expect(h.requests.find((request) => request.path.endsWith("/verify"))?.bearer).toBe(`Bearer ${session().access_token}`);
      expect(h.requests.some((request) => request.body === JSON.stringify({ refresh_token: "A-verified" }))).toBe(true);
    } finally { run.close(); await h.close(); }
  });
  it.each(["success", "failure"] as const)("late guarded %s does not save or remove replacement B", async (outcome) => {
    const h = fixture();
    await h.auth.initialize();
    const reply = h.holdRefresh();
    const events: string[] = [];
    const subscription = h.auth.onAuthStateChange((event) => { events.push(event); }).data.subscription;
    const pending = bound(h.auth).refreshSessionIfCurrent(expected());
    try {
      await h.refreshStarted.promise;
      await h.auth.signInWithPassword({ email: "B@example.invalid", password: "synthetic" });
      const boundary = events.length;
      reply.resolve(outcome === "success" ? Response.json(session("A", "refreshed")) : Response.json({ msg: "Invalid refresh token", code: "refresh_token_not_found" }, { status: 400 }));
      expect((await pending).data.session).toBeNull();
      expect((await h.auth.getSession()).data.session?.user.id).toBe("B");
      expect(events.slice(boundary)).not.toContain("SIGNED_OUT");
      expect(events.slice(boundary)).not.toContain("TOKEN_REFRESHED");
    } finally {
      reply.resolve(Response.json(session("A", "refreshed")));
      await pending.catch(() => {});
      subscription.unsubscribe(); await h.close();
    }
  });
  it("does not restore credentials after completed sign-out", async () => {
    const h = fixture();
    await h.auth.initialize();
    const reply = h.holdRefresh();
    const pending = bound(h.auth).refreshSessionIfCurrent(expected());
    try {
      await h.refreshStarted.promise;
      await h.auth.signOut();
      reply.resolve(Response.json(session("A", "refreshed")));
      expect((await pending).data.session).toBeNull();
      expect((await h.auth.getSession()).data.session).toBeNull();
    } finally {
      reply.resolve(Response.json(session("A", "refreshed")));
      await pending.catch(() => {});
      await h.close();
    }
  });
  it("rejects a refresh response for a different user without adopting it", async () => {
    const h = fixture();
    await h.auth.initialize();
    const reply = h.holdRefresh();
    reply.resolve(Response.json(session("B", "unexpected")));
    try {
      const result = await bound(h.auth).refreshSessionIfCurrent(expected());
      expect(result.error).not.toBeNull();
      expect(result.data.session).toBeNull();
      expect((await h.auth.getSession()).data.session?.refresh_token).toBe("A-initial");
    } finally { await h.close(); }
  });
  it("snapshots explicit preconditions before await and does not reinterpret Session fields", async () => {
    const h = fixture();
    await h.auth.initialize();
    try {
      const params = expected();
      const pending = bound(h.auth).refreshSessionIfCurrent(params);
      params.expectedAccessToken = "replacement";
      params.expectedUserId = "B";
      params.refresh_token = "B-other";
      expect((await pending).error).toBeNull();
      expect(h.requests.find((request) => request.path.endsWith("/token"))?.body).toBe(JSON.stringify({ refresh_token: "A-verified" }));
    } finally { await h.close(); }
  });
  it("fails before HTTP when only the SDK's fallback no-op lock is available", async () => {
    const h = fixture();
    await h.auth.initialize();
    const { lock, ...options } = h.options;
    const auth = new GoTrueClient(options);
    try {
      expect(lock).toBe(processLock);
      await auth.initialize();
      expect(auth.supportsSessionBoundRefresh()).toBe(false);
      expect((await auth.refreshSessionIfCurrent(expected())).data.session).toBeNull();
      expect(h.requests).toEqual([]);
    } finally { await auth.stopAutoRefresh(); await h.close(); }
  });
  it("releases the mutation lock before awaiting a subscriber's sign-out", async () => {
    const h = fixture();
    await h.auth.initialize();
    const subscription = h.auth.onAuthStateChange(async (event) => {
      if (event === "TOKEN_REFRESHED") await h.auth.signOut();
    }).data.subscription;
    try {
      expect((await bound(h.auth).refreshSessionIfCurrent(expected())).error).toBeNull();
      expect((await h.auth.getSession()).data.session).toBeNull();
    } finally { subscription.unsubscribe(); await h.close(); }
  });
  it.each(["split", "joined"] as const)("preserves %s userStorage migration", async (mode) => {
    const h = fixture();
    await h.auth.initialize();
    if (mode === "joined") {
      const { user, ...tokens } = session();
      h.values.set(h.key, JSON.stringify(tokens));
      h.values.set(`${h.key}-user`, JSON.stringify({ user }));
    }
    const auth = new GoTrueClient({ ...h.options, ...(mode === "split" ? { userStorage: h.storage } : {}) });
    try {
      expect((await auth.initialize()).error).toBeNull();
      expect((await auth.getSession()).data.session?.user.id).toBe("A");
      if (mode === "split") expect(JSON.parse(h.values.get(`${h.key}-user`)!).user.id).toBe("A");
      else {
        expect(h.values.has(`${h.key}-user`)).toBe(false);
        expect(JSON.parse(h.values.get(h.key)!).user.id).toBe("A");
      }
    } finally { await auth.stopAutoRefresh(); await h.close(); }
  });
  it("shared async storage serializes B behind A's started commit and leaves B final", async () => {
    const h = fixture();
    await h.auth.initialize();
    const second = new GoTrueClient(h.options);
    await second.initialize();
    const started = deferred<void>();
    const release = deferred<void>();
    const write = h.storage.setItem.bind(h.storage);
    h.storage.setItem = async (name, value) => {
      if (name === h.key && (JSON.parse(value) as { refresh_token?: string }).refresh_token === "A-refreshed") {
        started.resolve(); await release.promise;
      }
      await write(name, value);
    };
    const pending = bound(h.auth).refreshSessionIfCurrent(expected());
    let replacement: ReturnType<GoTrueClient["signInWithPassword"]> | undefined;
    let replaced = false;
    try {
      await started.promise;
      replacement = second.signInWithPassword({ email: "B@example.invalid", password: "synthetic" }).then((result) => { replaced = true; return result; });
      await h.passwordStarted.promise;
      await new Promise<void>((done) => { setImmediate(done); });
      expect(replaced).toBe(false);
      expect(JSON.parse(h.values.get(h.key)!).refresh_token).toBe("A-initial");
      release.resolve();
      expect((await pending).error).toBeNull();
      expect((await replacement).error).toBeNull();
      expect(JSON.parse(h.values.get(h.key)!).refresh_token).toBe("B-replacement");
    } finally {
      release.resolve();
      await Promise.allSettled([pending, replacement]);
      await second.stopAutoRefresh(); await h.close();
    }
  });
});
