// @vitest-environment node
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const project = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("./auth-js-2.103.3.patch.json", import.meta.url), "utf8"));
const owned = [];
let root;
let applySdkPatch;
let verifyArtifact;
let preimages;
async function put(path, data) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}
async function snapshot() {
  const result = [];
  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    const metadata = await stat(path);
    result.push({ path: file.path, data: await readFile(path, "utf8"), mtime: metadata.mtimeMs });
  }
  return result;
}
beforeEach(async () => {
  await mkdir(resolve(project, "dist"), { recursive: true });
  root = await mkdtemp(resolve(project, "dist/mfa-installer-"));
  owned.push(root);
  // Only the five patch preimages and inert package-resolution metadata. No
  // runnable dependency tree, cache, provider, or live credentials are copied.
  for (const file of manifest.files) await put(file.path, await readFile(resolve(project, file.path)));
  for (const name of ["auth-js", "supabase-js"]) {
    await put(`node_modules/@supabase/${name}/package.json`, JSON.stringify({
      name: `@supabase/${name}`, version: "2.103.3", main: "dist/main/index.js",
    }));
  }
  await put("node_modules/@supabase/auth-js/dist/main/index.js", "// inert resolver fixture\n");
  for (const file of ["apply.mjs", "verify-artifact.mjs", "auth-js-2.103.3.patch", "auth-js-2.103.3.patch.json"]) {
    await put(`scripts/auth-refresh/${file}`, await readFile(new URL(file, import.meta.url)));
  }
  ({ applySdkPatch } = await import(pathToFileURL(resolve(root, "scripts/auth-refresh/apply.mjs")).href));
  ({ verifyArtifact } = await import(pathToFileURL(resolve(root, "scripts/auth-refresh/verify-artifact.mjs")).href));
  const state = await verifyArtifact(root);
  if (state.state === "after") {
    // npm postinstall patches the real tree; reverse only this inert fixture.
    for (const check of [true, false]) {
      const result = spawnSync("git", ["apply", "--reverse", "--unidiff-zero", ...(check ? ["--check"] : []), "-"], {
        cwd: root, input: state.patch, encoding: "utf8",
        env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root), GIT_DIR: undefined,
          GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Fixture normalization failed: ${result.stderr}`);
    }
  }
  await verifyArtifact(root, "before");
  preimages = new Map();
  for (const file of manifest.files) preimages.set(file.path, await readFile(resolve(root, file.path)));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const path of owned.splice(0)) await rm(path, { recursive: true, force: true });
});
it("applies all five files and is a write-free success when already patched", async () => {
  const install = () => spawnSync(process.execPath, ["scripts/auth-refresh/apply.mjs", "."], { cwd: root, encoding: "utf8" });
  const first = install();
  expect(first.status, first.stderr).toBe(0);
  expect(first.stdout).toContain("Auth 2.103.3: patched");
  expect((await verifyArtifact(root, "after")).state).toBe("after");
  const before = await snapshot();
  vi.stubEnv("PATH", "");
  const second = install();
  expect(second.status, second.stderr).toBe(0);
  expect(second.stdout).toContain("Auth 2.103.3: already-patched");
  expect(await snapshot()).toEqual(before);
});
it.each(["auth-js", "supabase-js"])("rejects the wrong %s version before writing", async (name) => {
  await put(`node_modules/@supabase/${name}/package.json`, JSON.stringify({ name: `@supabase/${name}`, version: "2.117.2" }));
  const before = await snapshot();
  await expect(applySdkPatch(root)).rejects.toThrow(`Wrong ${name} version`);
  expect(await snapshot()).toEqual(before);
});
it("rejects a partially patched tree without attempting repair", async () => {
  await applySdkPatch(root);
  const file = manifest.files[0];
  await put(file.path, preimages.get(file.path));
  const before = await snapshot();
  await expect(applySdkPatch(root)).rejects.toThrow("Partial or mismatched");
  expect(await snapshot()).toEqual(before);
});
it("rejects a mismatched last file before any earlier file is patched", async () => {
  await put(manifest.files.at(-1).path, "unexpected bytes\n");
  const before = await snapshot();
  await expect(applySdkPatch(root)).rejects.toThrow("Partial or mismatched");
  expect(await snapshot()).toEqual(before);
});
it("rejects a linked target before mutating the shared source", async () => {
  const file = manifest.files[0];
  const shared = resolve(root, "shared-original.ts");
  await writeFile(shared, await readFile(resolve(root, file.path)));
  await rm(resolve(root, file.path));
  await symlink(shared, resolve(root, file.path));
  const before = await snapshot();
  await expect(applySdkPatch(root)).rejects.toThrow("Refusing linked dependency path");
  expect(await snapshot()).toEqual(before);
});
it("rejects a different Auth resolution even if the five root files match", async () => {
  const nested = "node_modules/@supabase/supabase-js/node_modules/@supabase/auth-js";
  await put(`${nested}/package.json`, JSON.stringify({ name: "@supabase/auth-js", version: "2.103.3", main: "index.js" }));
  await put(`${nested}/index.js`, "// other copy\n");
  const before = await snapshot();
  // Fixture normalization resolved the original tree; check the changed tree
  // in a fresh installer process, as npm postinstall does.
  const result = spawnSync(process.execPath, ["scripts/auth-refresh/apply.mjs", "."], { cwd: root, encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("different Auth package");
  expect(await snapshot()).toEqual(before);
});
it("propagates an unavailable patch executable without writing", async () => {
  const before = await snapshot();
  vi.stubEnv("PATH", "");
  await expect(applySdkPatch(root)).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});
it("propagates a nonzero patch exit without writing", async () => {
  const bin = resolve(root, "failure-bin");
  await mkdir(bin);
  await writeFile(resolve(bin, "git"), "#!/bin/sh\nexit 7\n", { mode: 0o755 });
  const before = await snapshot();
  vi.stubEnv("PATH", bin);
  await expect(applySdkPatch(root)).rejects.toThrow("failed (7)");
  expect(await snapshot()).toEqual(before);
});
