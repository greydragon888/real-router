// lint-spec-parity.mjs — the cheap, high-value slice of rfc-app-contract-linter (Tier-1 check 2).
//
// Static (<1 s, no build): every hand-maintained copy of a cross-router SWEEP CONSTANT must hold
// identical values. These constants live in ~7 places each (4 per-cohort `_shared/` specs +
// 2 angular inlines + 1 scenario driver) with nothing enforcing agreement — a driver-vs-app,
// react-vs-solid, or angular-vs-canon divergence would silently shift or DROP an @N sweep point
// per cohort and confound the cross-cohort `@N` comparison the whole bench exists to make.
//
// This does NOT restructure apps (no Phase-1 consolidation) and does NOT build/serve anything
// (no Tier-2). It is the single scariest-drift guard, standalone. Run: `node harness/lint-spec-parity.mjs`.
//
// Sites are AUTO-DISCOVERED by scanning for `const <NAME> = [ … ]` — NOT hardcoded filenames,
// because the definition can move between files per app (e.g. angular-router keeps DEEP_TARGETS
// in app.component.ts while real-router keeps it in routes.ts). A new cohort/engine copy is
// picked up automatically; a value that drifts fails loudly.

import { readFileSync, readdirSync } from "node:fs";
import { relative } from "node:path";

const HERE = import.meta.dirname; // benchmarks/cross-router/harness
const CR = `${HERE}/..`; //          benchmarks/cross-router

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dir may not exist (a cohort without a variant) — not this check's concern
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === ".svelte-kit") continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|svelte)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Extract the int array from `const <name> = [ … ]` (ignores imports/usages: only a `= [` literal
// matches). Returns null when the file references but does not DEFINE the constant.
function extractArray(src, name) {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return null;
  const nums = m[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : null;
}

// Each sweep constant: the app-side export name + the roots to scan, and the driver(s)
// that carry a hand-copy under a DIFFERENT local name (COUNTS / TARGETS / DEPTH_SWEEP —
// matcher-bench is instrument №2 and its DEPTH_SWEEP is a hand-copy of DEEP_TARGETS).
const SHARED = ["react", "vue", "solid", "svelte"].map((c) => `apps/${c}/_shared`);
const CHECKS = [
  { label: "SEARCH_COUNTS", appName: "SEARCH_COUNTS", roots: [...SHARED, "apps/angular"], drivers: [{ file: "scenarios/search-param-scaling.mjs", name: "COUNTS" }] },
  { label: "WIDE_TARGETS", appName: "WIDE_TARGETS", roots: [...SHARED, "apps/angular"], drivers: [{ file: "scenarios/wide-config.mjs", name: "TARGETS" }] },
  { label: "DEEP_TARGETS", appName: "DEEP_TARGETS", roots: [...SHARED, "apps/angular"], drivers: [{ file: "scenarios/deep-config.mjs", name: "TARGETS" }, { file: "matcher-bench/matchers.mjs", name: "DEPTH_SWEEP" }] },
];

let failed = 0;
let deepCanon = null; // stashed for the DEEP_DEPTH scalar check below
for (const chk of CHECKS) {
  // gather every definition site: app copies (scan roots) + the driver copies
  const sites = [];
  for (const root of chk.roots) {
    for (const file of walk(`${CR}/${root}`)) {
      const vals = extractArray(readFileSync(file, "utf8"), chk.appName);
      if (vals) sites.push({ file, name: chk.appName, vals });
    }
  }
  for (const driver of chk.drivers) {
    const dPath = `${CR}/${driver.file}`;
    const dVals = extractArray(readFileSync(dPath, "utf8"), driver.name);
    sites.push({ file: dPath, name: driver.name, vals: dVals, isDriver: true });
  }

  // canon = the react _shared copy (the documented reference); fall back to the first site
  const canonSite = sites.find((s) => s.file.includes("apps/react/_shared")) ?? sites[0];
  const canon = canonSite?.vals;
  const canonStr = JSON.stringify(canon);
  if (chk.label === "DEEP_TARGETS") deepCanon = canon;

  console.log(`\n${chk.label}  (canon = [${canon?.join(", ")}], ${sites.length} sites)`);
  for (const s of sites) {
    const ok = s.vals && JSON.stringify(s.vals) === canonStr;
    if (!ok) failed++;
    const tag = s.isDriver ? ` (driver \`${s.name}\`)` : "";
    console.log(
      `  ${ok ? "✓" : "✗"} ${relative(CR, s.file)}${tag}` +
        (ok ? "" : `  →  [${s.vals ? s.vals.join(", ") : "UNPARSED"}]`),
    );
  }
}

// DEEP_DEPTH — the SCALAR twin of DEEP_TARGETS (the depth of the nested chain every
// engine builds). It was a free literal in every copy — invisible to the array check
// above, and the angular-router deep app kept it in routes.ts with DEEP_TARGETS in
// app.component.ts, unlinked (audit 07-18 K19: the drift class that twice broke the
// search sweep). Every definition must now be DERIVED (Math.max(...DEEP_TARGETS) /
// (...DEPTH_SWEEP)) or literal-equal to max(canon DEEP_TARGETS).
{
  const maxDeep = deepCanon ? Math.max(...deepCanon) : null;
  const DERIVED = /Math\.max\(\s*\.\.\.\s*(DEEP_TARGETS|DEPTH_SWEEP)\s*\)/;
  const sites = [];
  for (const root of [...SHARED, "apps/angular", "matcher-bench"]) {
    for (const file of walk(`${CR}/${root}`)) {
      const m = readFileSync(file, "utf8").match(/\bDEEP_DEPTH\s*=\s*([^;\n]+)/);
      if (m) sites.push({ file, expr: m[1].trim() });
    }
  }
  console.log(`\nDEEP_DEPTH  (must equal max(DEEP_TARGETS) = ${maxDeep}, ${sites.length} sites)`);
  for (const s of sites) {
    const derived = DERIVED.test(s.expr);
    const literal = /^\d+$/.test(s.expr) ? Number(s.expr) : null;
    const ok = derived || (literal !== null && literal === maxDeep);
    if (!ok) failed++;
    console.log(
      `  ${ok ? "✓" : "✗"} ${relative(CR, s.file)}  =  ${s.expr}` +
        (ok ? "" : `  →  expected Math.max(...DEEP_TARGETS) or ${maxDeep}`),
    );
  }
}

if (failed) {
  console.error(`\n✗ spec-parity: ${failed} site(s) diverge from canon — a sweep point would shift/drop per cohort.`);
  process.exit(1);
}
console.log(`\n✓ spec-parity: all sweep-constant copies agree.`);
