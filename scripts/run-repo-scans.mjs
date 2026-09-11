#!/usr/bin/env node
// Run every repository-wide scan, out of turbo (#2241).
//
// A scan whose SUBJECT is the whole tree cannot live behind a per-package cache key:
// turbo replays `@real-router/core:test` whenever the change was in a SIBLING, and a
// scan that did not run is indistinguishable from one that passed. Measured — that is
// how `captured-intrinsics-authority-1971` sat RED on `master` from #2236 to #2240
// while the hook on the breaking commit printed `cache hit, replaying logs`.
//
// ⚠ The file list comes from `scripts/repo-wide-scans.json` and is NOT written here.
// The whole defect #2241 names is coverage registered by hand in several places at
// once; a second list in this script would reproduce it. One list, two consumers —
// this runner EXECUTES the scans, and `repo-scan-authority-2241` proves the list is
// complete by deriving the set from the AST instead of trusting it.
//
// Cost, measured on this tree: 12 scans, 117 cells, three vitest invocations,
// ~8.6 s wall. It replaces three hook steps that covered three of the twelve.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(REPO_ROOT, "scripts/repo-wide-scans.json");

/** @type {{ scans: { file: string, reads: string }[] }} */
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));

// Group by the workspace that owns each scan: vitest is invoked once per package, not
// once per file, so the start-up is paid three times rather than twelve.
/** @type {Map<string, string[]>} */
const byWorkspace = new Map();

for (const { file } of registry.scans) {
  const [, workspaceDir] = file.split("/");
  const workspace = path.join("packages", workspaceDir);
  const list = byWorkspace.get(workspace) ?? [];

  list.push(path.relative(workspace, file));
  byWorkspace.set(workspace, list);
}

if (byWorkspace.size === 0) {
  console.error(
    `run-repo-scans: ${path.relative(REPO_ROOT, REGISTRY)} lists no scans.\n` +
      `   An empty registry would make this script exit 0 without running anything,\n` +
      `   which is the exact failure mode #2241 is about. Refusing.`,
  );
  process.exit(2);
}

let failed = 0;
const started = Date.now();

for (const [workspace, files] of [...byWorkspace].sort()) {
  const manifest = JSON.parse(
    readFileSync(path.join(REPO_ROOT, workspace, "package.json"), "utf8"),
  );

  console.log(`\n▸ ${manifest.name} — ${String(files.length)} scan(s)`);

  try {
    execFileSync(
      "pnpm",
      [
        "-F",
        manifest.name,
        "exec",
        "vitest",
        "run",
        ...files,
        "--coverage.enabled=false",
      ],
      { cwd: REPO_ROOT, stdio: "inherit" },
    );
  } catch {
    failed += 1;
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (failed > 0) {
  console.error(
    `\n✗ repo-wide scans: ${String(failed)} workspace(s) failed · ${seconds}s`,
  );
  process.exit(1);
}
console.log(
  `\n✓ repo-wide scans: ${String(registry.scans.length)} scan(s) across ` +
    `${String(byWorkspace.size)} workspace(s) · ${seconds}s`,
);
