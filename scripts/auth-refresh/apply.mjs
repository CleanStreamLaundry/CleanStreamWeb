// Apply the exact accepted artifact only to a fully verified physical npm tree.
import { realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import process from "node:process";
import { verifyArtifact } from "./verify-artifact.mjs";

export async function applySdkPatch(root) {
  const project = await realpath(resolve(root));
  const before = await verifyArtifact(project);
  // Refuse linked node_modules/package/target paths, including this lane's
  // dependency link. Installation must not mutate a shared dependency tree.
  for (const path of ["node_modules/@supabase/auth-js/package.json", "node_modules/@supabase/supabase-js/package.json",
    ...before.manifest.files.map((file) => file.path)]) {
    const target = resolve(project, path);
    if (await realpath(target) !== target) throw new Error(`Refusing linked dependency path: ${path}`);
  }
  if (before.state === "after") return "already-patched";

  for (const args of [["--check"], ["--whitespace=nowarn"]]) {
    const result = spawnSync("git", ["apply", "--unidiff-zero", ...args, "-"], {
      cwd: project, input: before.patch, encoding: "utf8",
      env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(project), GIT_DIR: undefined,
        GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Auth patch ${args[0]} failed (${result.status ?? result.signal}): ${result.stderr}`);
  }
  await verifyArtifact(project, "after");
  return "patched";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ?? fileURLToPath(new URL("../../", import.meta.url));
  const result = await applySdkPatch(root);
  process.stdout.write(`Auth 2.103.3: ${result}\n`);
}
