import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = new URL("./bootstrap-admin-owner.mjs", import.meta.url);
const run = (...args) => spawnSync(process.execPath, [fileURLToPath(script), ...args], {
  encoding: "utf8",
});

test("prints guarded SQL without provider access or mail", () => {
  const result = run("--email", "Owner@example.invalid");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bootstrap_email='owner@example\.invalid'/);
  for (const guard of ["Trusted operator required", "missing or ambiguous",
    "pending deletion", "pg_advisory_xact_lock", "admin_portal_bootstrap_owner",
    "admin_audit_events", "commit;"]) assert.ok(result.stdout.includes(guard), guard);
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /createClient|process\.env|fetch\(|inviteUserByEmail|resetPasswordForEmail/);
});

test("deduplicates positive location IDs in the operator call", () => {
  const result = run("--email", "owner@example.invalid", "--locations", "2,3,2");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("ARRAY[2,3]::bigint[]"));
});

test("keeps quoted email input outside the dollar-quoted block", () => {
  const email = "o'neil$$@example.invalid";
  const result = run("--email", email);
  assert.equal(result.status, 0, result.stderr);
  const setting = "set local cleanstream.bootstrap_email='o''neil$$@example.invalid';";
  assert.ok(result.stdout.includes(setting));
  assert.ok(result.stdout.indexOf(setting) < result.stdout.indexOf("do $$"));
  assert.match(result.stdout, /standard_conforming_strings=on/);
});

test("rejects the retired apply path without emitting SQL", () => {
  const result = run("--email", "owner@example.invalid", "--apply");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /--apply is retired/);
});

test("rejects embedded ASCII controls without emitting SQL", () => {
  // NUL cannot occur in an OS argument; exercise every other ASCII control.
  for (const code of [...Array.from({ length: 31 }, (_, index) => index + 1), 127]) {
    const result = run("--email", `a${String.fromCharCode(code)}b@example.invalid`);
    assert.notEqual(result.status, 0, `ASCII ${code}`);
    assert.equal(result.stdout, "", `ASCII ${code}`);
    assert.match(result.stderr, /Provide --email/, `ASCII ${code}`);
  }
});

test("rejects missing or invalid identity and location input", () => {
  for (const args of [[], ["--email", "invalid"], ["--email", "a\nb@example.invalid"],
    ["--email", "owner@example.invalid", "--locations", "0"],
    ["--email", "owner@example.invalid", "--locations", "1,nope"],
    ["--email", "owner@example.invalid", "--locations", "9007199254740992"]]) {
    const result = run(...args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  }
});
