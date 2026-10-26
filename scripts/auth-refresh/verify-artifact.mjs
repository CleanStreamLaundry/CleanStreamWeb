// Read-only installation preflight/postflight; never applies the patch.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { URL, pathToFileURL } from "node:url";
import process from "node:process";

const artifact = new URL("./auth-js-2.103.3.patch", import.meta.url);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const targets = ["src/GoTrueClient.ts", "dist/main/GoTrueClient.js", "dist/module/GoTrueClient.js",
  "dist/main/GoTrueClient.d.ts", "dist/module/GoTrueClient.d.ts"]
  .map((path) => `node_modules/@supabase/auth-js/${path}`);

export async function verifyArtifact(root, expectedState) {
  if (expectedState !== undefined && !["before", "after"].includes(expectedState)) throw new Error("Invalid expected state");
  const project = resolve(root);
  const manifest = JSON.parse(await readFile(new URL(`${artifact.href}.json`), "utf8"));
  const patch = await readFile(artifact);
  if (manifest.package !== "@supabase/auth-js" || manifest.version !== "2.103.3" ||
      !Array.isArray(manifest.files) || manifest.files.length !== targets.length ||
      new Set(manifest.files.map((file) => file.path)).size !== targets.length ||
      manifest.files.some((file) => !targets.includes(file.path))) throw new Error("Unexpected five-file manifest");
  if (hash(patch) !== manifest.patchSha256) throw new Error("Patch hash mismatch");
  for (const name of ["auth-js", "supabase-js"]) {
    const pkg = JSON.parse(await readFile(resolve(project, `node_modules/@supabase/${name}/package.json`), "utf8"));
    if (pkg.name !== `@supabase/${name}` || pkg.version !== "2.103.3") throw new Error(`Wrong ${name} version`);
  }
  const consumer = createRequire(resolve(project, "node_modules/@supabase/supabase-js/package.json"));
  if (consumer.resolve("@supabase/auth-js") !== resolve(project, "node_modules/@supabase/auth-js/dist/main/index.js")) {
    throw new Error("Supabase resolves a different Auth package; expected the reviewed root copy");
  }
  let before = true;
  let after = true;
  for (const file of manifest.files) {
    const digest = hash(await readFile(resolve(project, file.path)));
    before = before && digest === file.before;
    after = after && digest === file.after;
  }
  if (!before && !after) throw new Error("Partial or mismatched SDK state; no files changed");
  const state = after ? "after" : "before";
  if (expectedState && state !== expectedState) throw new Error(`Expected ${expectedState} SDK bytes; found ${state}`);
  return { state, manifest, patch };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, state] = process.argv.slice(2);
  if (!root || !["before", "after"].includes(state)) {
    throw new Error("Usage: verify-artifact.mjs PROJECT_ROOT before|after");
  }
  const result = await verifyArtifact(root, state);
  process.stdout.write(`Verified ${result.state}: ${result.manifest.files.length} files; patch ${result.manifest.patchSha256}\n`);
}
