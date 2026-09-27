// Provenance stamp for the results `env` block. The workspace installs @real-router/*
// from npm, so a cell records which release it measured — the core version here, each
// engine's own version in its cell (engine-versions.mjs) — and the git state of the
// harness at measurement time, so a mixed-epoch matrix leaves a trace. Shared by every
// results writer so none of them can drop it.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";

// The @real-router/core release installed in this workspace, or null outside it. The
// adapters take core as a peer, so an adapter's version alone does not say which core ran.
function coreVersion(here) {
  try {
    return JSON.parse(
      readFileSync(join(here, "node_modules", "@real-router", "core", "package.json"), "utf8"),
    ).version;
  } catch {
    return null;
  }
}

// Return { commit, dirty, dirtyFiles, dirtyCode, realRouterCore } for the env block. Call
// ONCE per process, before building. `here` = the cross-router dir.
export function readProvenance(here) {
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
    realRouterCore: coreVersion(here),
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
