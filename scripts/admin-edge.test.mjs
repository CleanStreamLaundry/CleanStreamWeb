import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchPortal } from "../../CleanStreamLaundryApp/supabase/functions/admin-portal/logic.ts";
const fake = (overrides) => ({
  authenticate: async () => "verified-user",
  rpc: async (actor, action, payload) => ({ actor, action, payload }),
  invite: async () => ({ success: true }),
  resend: async () => ({ success: true }),
  resolve: async () => ({ success: true }),
  ...overrides,
});
test("token and route validation fail closed", async () => {
  await assert.rejects(dispatchPortal("", {}, fake()), /Sign in/);
  await assert.rejects(
    dispatchPortal("token", { action: "assignMember" }, fake()),
    /Unknown/,
  );
  await assert.rejects(
    dispatchPortal(
      "token",
      { action: "identity" },
      fake({
        authenticate: async () => {
          throw new Error("Expired");
        },
      }),
    ),
    /Expired/,
  );
});
test("body cannot impersonate another actor", async () => {
  const result = await dispatchPortal(
    "token",
    { action: "locations", actor: "forged" },
    fake(),
  );
  assert.equal(result.actor, "verified-user");
});
test("invites normalize email and deduplicate location IDs", async () => {
  let input;
  await dispatchPortal(
    "token",
    { action: "invite", email: " STAFF@Example.com ", locationIds: [1, 1, 2] },
    fake({
      invite: async (...args) => {
        input = args;
        return {};
      },
    }),
  );
  assert.deepEqual(input, ["verified-user", "staff@example.com", [1, 2]]);
});
test("invites reject invalid or empty assignment lists", async () => {
  for (const locationIds of [[], [0], ["1"], [-2]])
    await assert.rejects(
      dispatchPortal(
        "token",
        { action: "invite", email: "staff@example.com", locationIds },
        fake(),
      ),
      /valid location/,
    );
});
test("credit authorization happens before invoking an existing payment function", async () => {
  let resolved = false;
  await assert.rejects(
    dispatchPortal(
      "token",
      { action: "resolveCredit", id: 1, decision: "approved", note: "" },
      fake({
        rpc: async () => {
          throw new Error("Scope denied");
        },
        resolve: async () => {
          resolved = true;
        },
      }),
    ),
    /Scope denied/,
  );
  assert.equal(resolved, false);
});
test("credit forwards verified token and exact decision without touching balances", async () => {
  let resolved;
  await dispatchPortal(
    "verified-token",
    { action: "resolveCredit", id: 7, decision: "denied", note: "Reviewed" },
    fake({
      resolve: async (...args) => {
        resolved = args;
        return {};
      },
    }),
  );
  assert.deepEqual(resolved, ["verified-token", 7, "denied", "Reviewed"]);
});
test("new operational routes use the token-derived actor; internal audit context cannot be forged", async () => {
  for (const action of [
    "transactions",
    "audit",
    "assignees",
    "setAvailability",
    "exportRecords",
  ]) {
    const result = await dispatchPortal(
      "token",
      { action, actor: "forged", dataset: "audit" },
      fake(),
    );
    assert.equal(result.actor, "verified-user");
  }
  await assert.rejects(
    dispatchPortal("token", { action: "recordDelivery" }, fake()),
    /Unknown/,
  );
});
