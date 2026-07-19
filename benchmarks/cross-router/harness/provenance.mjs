// Provenance + dist-freshness gate (#1459). Engines resolve to `packages/*/dist` (fair,
// but STALE if `src` was edited without a rebuild — the 07-11 vue matrix silently
// measured a pre-#1424 dist). This module (a) refuses to run when any `packages/*/src`
// is newer than the built `dist`, and (b) returns the git provenance stamp for the
// results `env` block so a mixed-epoch matrix leaves a trace. Shared by run.mjs (single
// cell) and run-all.mjs (interleaved matrix) so the guard can't be bypassed by either.
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";

const newestMtime = (root, exts) => {
  let max = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // dir absent (e.g. a package with no src, or no dist yet)
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        // symlinks are not dirs → the walk never descends them; the shared/ TREE those
        // symlinks point at is scanned directly by the gate below (audit 07-18 K3).
        if (e.name !== "node_modules") stack.push(p);
      } else if (!exts || exts.some((x) => e.name.endsWith(x))) {
        try {
          max = Math.max(max, statSync(p).mtimeMs);
        } catch {
          /* raced away */
        }
      }
    }
  }
  return max;
};

// Run the freshness gate (exits 3 if stale, unless BENCH_ALLOW_STALE_DIST=1) and return
// { commit, dirty, distNewestMtime } for the env block. Call ONCE per process, before
// building. `here` = the cross-router dir (repo root is here/../..).
export function freshnessGateAndProvenance(here) {
  const pkgs = join(here, "..", "..", "packages");
  let srcMtime = 0;
  let distMtime = 0;
  try {
    for (const pkg of readdirSync(pkgs, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      srcMtime = Math.max(
        srcMtime,
        newestMtime(join(pkgs, pkg.name, "src"), [".ts", ".tsx"]),
      );
      distMtime = Math.max(
        distMtime,
        newestMtime(join(pkgs, pkg.name, "dist"), [".mjs", ".cjs", ".js"]),
      );
    }
    // shared/ sources (browser-env / dom-utils / ssr) reach dist only through consumer
    // symlinks (src/browser-env etc.), and the per-package walk above never descends a
    // symlink — so an edit to shared/*.ts sailed past the gate un-bundled and silently
    // measured stale dist across five cohorts' Link/history hot path (audit 07-18 K3).
    // Scan the real shared/ tree directly.
    srcMtime = Math.max(
      srcMtime,
      newestMtime(join(here, "..", "..", "shared"), [".ts", ".tsx"]),
    );
  } catch {
    /* not a monorepo checkout — no gate, no dist provenance */
  }
  if (distMtime > 0 && srcMtime > distMtime && !process.env.BENCH_ALLOW_STALE_DIST) {
    console.error(
      `provenance: STALE DIST — packages/*/src (${new Date(srcMtime).toISOString()}) is newer ` +
        `than packages/*/dist (${new Date(distMtime).toISOString()}). Engines resolve to dist/, so ` +
        `this would measure code that isn't built (#1459). Run \`pnpm bundle\` first, or set ` +
        `BENCH_ALLOW_STALE_DIST=1 to override.`,
    );
    process.exit(3);
  }
  let commit = "unknown";
  let dirty = null;
  let dirtyFiles = null;
  let dirtyCode = null;
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
    // Record WHICH files were dirty at MEASUREMENT time. A bare `dirty` bool can't tell
    // "docs-only" from "bench/src code dirty" — and the latter means the cell measures an
    // un-pinnable state (the code that ran was never committed). `dirtyCode` flags exactly
    // that load-bearing case (any dirty JS/TS), making the provenance a verifiable per-run
    // fact instead of a retrospective guess (audit Q1, 2026-07-16).
    // Split the RAW output (no leading .trim() — that strips the first line's leading
    // status space, e.g. an unstaged " M path", shifting slice(3) one char into the path).
    // Porcelain v1 lines are `XY PATH` (2 status chars + 1 space), so the path is slice(3).
    const porcelain = execSync("git status --porcelain", { cwd: here }).toString();
    dirtyFiles = porcelain.split("\n").filter((l) => l).map((l) => l.slice(3));
    dirty = dirtyFiles.length > 0;
    dirtyCode = dirtyFiles.some((f) => /\.(mjs|cjs|js|ts|tsx)$/.test(f));
  } catch {
    /* git unavailable — leave commit=unknown */
  }
  return {
    commit,
    dirty,
    dirtyFiles,
    dirtyCode,
    distNewestMtime: distMtime ? new Date(distMtime).toISOString() : null,
  };
}

// Uniform per-cell env stamp — ONE composition for every results/ writer (run.mjs,
// run-all.mjs, run-subset.mjs) and for matcher-bench, so a writer can't silently drop
// the O-10 machine fields again (run-subset shipped a date-only env until audit
// 07-18 K15, making its cells' machine provenance unrecoverable).
export function envStamp(provenance) {
  return {
    date: new Date().toISOString(),
    cpu: cpus()[0]?.model ?? "unknown",
    runner: process.env.BENCH_RUNNER ?? "local",
    ...provenance,
  };
}
