#!/usr/bin/env node
// Reachability ratchet (engine-merge RFC §5.5 / Appendix A): runs the engine's
// FACADE tier with coverage, extracts the src/** lines NOT reachable from the
// facade alone, and diffs them against packages/core/ENGINE_REACHABILITY.json.
// Any drift = fail: growth means new facade-unreachable code appeared; shrinkage
// means the ratchet can be tightened (--update).
//
//   node scripts/reachability-check.mjs             run + check
//   node scripts/reachability-check.mjs --update    refresh the counters (verdict/note kept)
//   node scripts/reachability-check.mjs --skip-run   check against an existing coverage-facade/
//   node scripts/reachability-check.mjs --lines      print the uncovered lines (for triage)

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";

const ENGINE_ROOT = resolve(import.meta.dirname, "../packages/core");
const COVERAGE_JSON = resolve(ENGINE_ROOT, "coverage-facade/coverage-final.json");
const REGISTRY = resolve(ENGINE_ROOT, "ENGINE_REACHABILITY.json");
const VERDICTS = new Set(["dead", "gap", "keep"]);

const args = new Set(process.argv.slice(2));

if (!args.has("--skip-run")) {
  execSync("pnpm exec vitest run --config vitest.config.facade.mts", {
    cwd: ENGINE_ROOT,
    stdio: "inherit",
  });
}

// v8 provider writes istanbul-compatible maps: statementMap + hit counters `s`.
// An uncovered line = a statement line with s[id] === 0. (An uncovered BRANCH on
// a covered line is not visible to this ratchet — see Appendix A.5.)
const coverage = JSON.parse(readFileSync(COVERAGE_JSON, "utf8"));
const uncoveredByFile = new Map(); // "src/..." -> sorted line numbers

for (const [absPath, entry] of Object.entries(coverage)) {
  const rel = relative(ENGINE_ROOT, entry.path ?? absPath).replaceAll("\\", "/");
  if (!rel.startsWith("src/")) continue;

  const lines = new Set();
  for (const [id, count] of Object.entries(entry.s ?? {})) {
    if (count > 0) continue;
    const loc = entry.statementMap?.[id];
    if (!loc) continue;
    for (let l = loc.start.line; l <= loc.end.line; l++) lines.add(l);
  }
  if (lines.size > 0) {
    uncoveredByFile.set(rel, [...lines].sort((a, b) => a - b));
  }
}

const registry = existsSync(REGISTRY)
  ? JSON.parse(readFileSync(REGISTRY, "utf8"))
  : { files: {} };

if (args.has("--lines")) {
  for (const [file, lines] of uncoveredByFile) {
    console.log(`\n${file}:`);
    const src = readFileSync(resolve(ENGINE_ROOT, file), "utf8").split("\n");
    for (const l of lines) {
      console.log(`  ${String(l).padStart(4)} | ${src[l - 1]?.trim() ?? ""}`);
    }
  }
}

if (args.has("--update")) {
  const next = { ...registry, files: {} };
  for (const [file, lines] of uncoveredByFile) {
    const prev = registry.files[file];
    next.files[file] = {
      uncovered: lines.length,
      verdict: prev?.verdict ?? "TODO-triage",
      note: prev?.note ?? "",
    };
  }
  writeFileSync(REGISTRY, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`registry updated: ${Object.keys(next.files).length} file(s)`);
  process.exit(0);
}

const failures = [];

for (const [file, meta] of Object.entries(registry.files)) {
  if (meta.verdict === "TODO-triage") {
    failures.push(`TODO   ${file}: entry has no triage verdict (dead | gap | keep)`);
  } else if (!VERDICTS.has(meta.verdict)) {
    failures.push(`BAD    ${file}: unknown verdict "${meta.verdict}"`);
  }
}

for (const [file, lines] of uncoveredByFile) {
  const known = registry.files[file];
  if (!known) {
    failures.push(`NEW    ${file}: ${lines.length} facade-unreachable line(s) — needs triage`);
  } else if (lines.length > known.uncovered) {
    failures.push(`GREW   ${file}: ${known.uncovered} -> ${lines.length}`);
  } else if (lines.length < known.uncovered) {
    failures.push(`SHRANK ${file}: ${known.uncovered} -> ${lines.length} — tighten the ratchet (--update)`);
  }
}

for (const file of Object.keys(registry.files)) {
  if (!uncoveredByFile.has(file)) {
    failures.push(`CLEAR  ${file}: fully facade-covered now — drop the entry (--update)`);
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(
    "\nreachability ratchet FAILED (RFC §5.5; --lines to inspect, --update after triage)",
  );
  process.exit(1);
}

const total = [...uncoveredByFile.values()].reduce((n, l) => n + l.length, 0);
console.log(
  `reachability ratchet OK: ${uncoveredByFile.size} file(s), ${total} registered facade-unreachable line(s)`,
);
