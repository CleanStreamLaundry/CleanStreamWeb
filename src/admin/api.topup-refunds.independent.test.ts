import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminApi } from "./api";

const holder = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => holder.client! }));
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const expiresAt = Math.floor(Date.now()/1000)+3600;
const record = {
  id, load_id: "9007199254740993", customer_id: other, status: "pending", principal_cents: 2000,
  bonus_reserved_cents: 500, currency: "usd", requested_at: "2026-09-30T12:00:00.123456+00:00",
  payment_succeeded_at: "2026-09-30T11:00:00+00:00", reviewed_at: null, completed_at: null,
  policy_version: "unused-topup-v1", location_id: null, review_note: null,
};
function token(subject: string, generation = 1) {
  const part = (value: object) => btoa(JSON.stringify(value)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: subject, exp: expiresAt, aal: "aal2", generation })}.${part({ synthetic: true })}`;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const dispatches: { bearer: string | null; body: Record<string, unknown> }[] = [];
let body: unknown;
let httpStatus: number;
let serial = 0;
beforeEach(async () => {
  dispatches.length = 0; body = { data: record }; httpStatus = 202;
  holder.client = createClient("https://offline.invalid", "synthetic-public", {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, storageKey: `independent-owner-${++serial}` },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      expect(new URL(request.url).origin).toBe("https://offline.invalid");
      const bearer = request.headers.get("authorization");
      if (new URL(request.url).pathname === "/auth/v1/user") {
        const payload = JSON.parse(atob(bearer!.split(".")[1]!.replaceAll("-", "+").replaceAll("_", "/"))) as { sub: string };
        return Response.json({ id: payload.sub, aud: "authenticated", role: "authenticated", email: "synthetic@invalid.test",
          app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
      }
      expect(new URL(request.url).pathname).toBe("/functions/v1/voluntary-topup-refund");
      dispatches.push({ bearer, body: await request.json() });
      return Response.json(body, { status: httpStatus });
    } },
  });
  const result = await holder.client.auth.setSession({ access_token: token(owner), refresh_token: "synthetic-refresh" });
  expect(result.error).toBeNull();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await holder.client!.auth.stopAutoRefresh();
  await holder.client!.removeAllChannels();
  holder.client = null;
});

it("actual installed SDK sends only captured Owner bearer and backend review fields", async () => {
  const result = await adminApi.reviewTopupRefund(owner, id, "approve", "Synthetic review");
  expect(result.status).toBe("pending");
  expect(dispatches).toEqual([{ bearer: `Bearer ${token(owner)}`, body: { action: "approve", id, note: "Synthetic review" } }]);
  expect(holder.client!.getChannels()).toEqual([]);
});

it.each(["A-B", "A-B-A"])("actual SDK awaited access-token lookup cannot retarget %s dispatch or accept its late reply", async (transition) => {
  const client = holder.client!, original = client.auth.getSession.bind(client.auth);
  const waiting = deferred(), release = deferred();
  let reads = 0;
  vi.spyOn(client.auth, "getSession").mockImplementation(async () => {
    const result = await original();
    if (++reads === 2) { waiting.resolve(); await release.promise; }
    return result;
  });
  const pending = expect(adminApi.reviewTopupRefund(owner, id, "approve", "")).rejects.toThrow("Owner session changed");
  await waiting.promise;
  await client.auth.setSession({ access_token: token(other), refresh_token: "synthetic-b" });
  if (transition === "A-B-A") await client.auth.setSession({ access_token: token(owner, 2), refresh_token: "synthetic-a2" });
  release.resolve(); await pending;
  expect(dispatches).toHaveLength(1);
  expect(dispatches[0]!.bearer).toBe(`Bearer ${token(owner)}`);
  expect((await original()).data.session!.user.id).toBe(transition === "A-B" ? other : owner);
});

it("actual 503 FunctionsHttpError body yields reconciliation guidance, with no implicit retry", async () => {
  body = { error: "refund_outcome_unknown", reconciliation_required: true }; httpStatus = 503;
  await expect(adminApi.reviewTopupRefund(owner, id, "reconcile", "")).rejects.toThrow(/unconfirmed.*reconcile.*must not be released manually/);
  expect(dispatches).toHaveLength(1);
});

it("actual SDK preserves microseconds and bigint string values without request ownership overrides", async () => {
  body = { data: [record] }; httpStatus = 200;
  const result = await adminApi.topupRefunds(owner, { before: record.requested_at, before_id: id });
  expect(result[0]!.load_id).toBe("9007199254740993");
  expect(dispatches[0]!.body).toEqual({ action: "list", before: record.requested_at, before_id: id });
});
