#!/usr/bin/env node
/**
 * Stryker mutation-report analyzer — companion to the /mutation-score skill.
 *
 * The skill used to ask the model to hand-write a throwaway node script every run
 * to aggregate `reports/mutation-report.json`. That re-derivation is per-run cost
 * AND the most error-prone manual step lived OUTSIDE it: deciding, per survivor,
 * whether `// Stryker disable next-line <Mutator>` is even *structurally* possible
 * without silencing a Killed sibling. This tool codifies both.
 *
 * Default mode — aggregate + suppress-safety verdict:
 *   node scripts/mutation-analyze.mjs <target>
 *     <target> = a package name (`route-tree`, `@real-router/logger`), a package
 *     dir (`packages/core`), a dir, or a path to a mutation-report.json.
 *   Prints: status counts, package + per-file score, and every Survived/NoCoverage
 *   mutant grouped by file → line:col → mutator, each tagged:
 *     • DISABLE-SAFE  — no Killed/Timeout sibling of that mutator anywhere on the
 *       line ⇒ `disable next-line <Mutator>` won't drop a kill. Emits the exact
 *       comment to paste (one per line, listing all safe mutators).
 *     • ENTANGLED-KEEP — that mutator HAS a Killed sibling on the line (same or a
 *       different column / replacement). `disable next-line` is mutator-level and
 *       column-blind, so suppressing it would drop the kill. Document, don't disable.
 *
 *   ⚠ DISABLE-SAFE is a STRUCTURAL verdict, NOT "this mutant is equivalent". You
 *   still MUST prove equivalence empirically (inject the exact mutation, full suite
 *   green) before adding any disable. The tool tells you what you *may* suppress
 *   without losing a kill — never what you *should*.
 *
 * Line-dump mode — inspect every mutant (any status) at specific lines:
 *   node scripts/mutation-analyze.mjs <target> --lines src/foo.ts:92,238
 *     Repeatable / comma-separated. Shows id, status, mutator, line:col, replacement
 *     — for eyeballing entanglement or cross-checking a fresh post-fix report.
 *
 * No deps, pure node. Score formula matches the skill:
 *   Detected = Killed + Timeout ; Valid = Detected + Survived + NoCoverage ;
 *   Score = Detected / Valid (CompileError + Ignored excluded from the denominator).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DETECTED = new Set(["Killed", "Timeout"]);

function fail(msg) {
  console.error(`mutation-analyze: ${msg}`);
  process.exit(1);
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node scripts/mutation-analyze.mjs <target>                 aggregate + suppress-safety",
      "  node scripts/mutation-analyze.mjs <target> --lines f.ts:92,238   dump mutants at lines",
      "",
      "  <target>: package name | packages/<dir> | dir | path/to/mutation-report.json",
      "  --survived-only   in default mode, skip the per-file score table",
    ].join("\n"),
  );
}

/**
 * Resolve <target> to a mutation-report.json path.
 * Order: explicit .json → dir-with-reports → packages/<scope-stripped> →
 * scan packages/* for a matching package.json `name`.
 */
function resolveReportPath(target) {
  const candidates = [];
  const direct = isAbsolute(target) ? target : resolve(process.cwd(), target);

  // Explicit .json (relative to cwd, then repo root)
  if (target.endsWith(".json")) {
    candidates.push(direct, resolve(REPO_ROOT, target));
  } else {
    // Dir holding reports/ (cwd-relative, then repo-root-relative)
    candidates.push(
      join(direct, "reports", "mutation-report.json"),
      join(resolve(REPO_ROOT, target), "reports", "mutation-report.json"),
    );
    // Package name → packages/<scope-stripped>
    const short = target.replace(/^@[^/]+\//, "");
    candidates.push(
      join(REPO_ROOT, "packages", short, "reports", "mutation-report.json"),
    );
  }

  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }

  // Last resort: scan packages/* for a matching package.json `name`.
  const pkgsDir = join(REPO_ROOT, "packages");
  if (existsSync(pkgsDir)) {
    for (const entry of readdirSync(pkgsDir)) {
      const pkgJson = join(pkgsDir, entry, "package.json");
      if (!existsSync(pkgJson)) continue;
      let name;
      try {
        name = JSON.parse(readFileSync(pkgJson, "utf8")).name;
      } catch {
        continue;
      }
      if (name === target || name === `@real-router/${target}`) {
        const report = join(pkgsDir, entry, "reports", "mutation-report.json");
        if (existsSync(report)) return report;
        fail(
          `resolved "${target}" → packages/${entry}, but reports/mutation-report.json is missing (run test:mutation with the json reporter).`,
        );
      }
    }
  }

  fail(
    `could not resolve "${target}" to a mutation-report.json. Pass a package name, packages/<dir>, or a path to the report.`,
  );
}

function loadMutants(reportPath) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    fail(`cannot read/parse ${reportPath}: ${err.message}`);
  }
  if (!report?.files)
    fail(`${reportPath} has no "files" — not a Stryker JSON report.`);

  const mutants = [];
  for (const [file, fdata] of Object.entries(report.files)) {
    for (const m of fdata.mutants ?? []) {
      mutants.push({
        file,
        status: m.status,
        mutator: m.mutatorName,
        line: m.location.start.line,
        col: m.location.start.column,
        endLine: m.location.end.line,
        endCol: m.location.end.column,
        replacement: m.replacement ?? "",
      });
    }
  }
  return mutants;
}

function scoreOf(mutants) {
  const c = {};
  for (const m of mutants) c[m.status] = (c[m.status] ?? 0) + 1;
  const detected = (c.Killed ?? 0) + (c.Timeout ?? 0);
  const valid = detected + (c.Survived ?? 0) + (c.NoCoverage ?? 0);
  const score = valid === 0 ? 100 : (detected / valid) * 100;
  return { counts: c, detected, valid, score };
}

/** Per-line: which mutators have a Killed/Timeout sibling (any column/value). */
function killedMutatorsByLine(mutants) {
  const map = new Map(); // `${file}:${line}` → Set<mutator>
  for (const m of mutants) {
    if (!DETECTED.has(m.status)) continue;
    const key = `${m.file}:${m.line}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(m.mutator);
  }
  return map;
}

function fmt(n) {
  return n.toFixed(2).padStart(6);
}

function aggregate(mutants, { survivedOnly } = {}) {
  const overall = scoreOf(mutants);
  console.log("=== TOTALS ===");
  console.log(
    Object.entries(overall.counts)
      .map(([k, v]) => `${k}=${v}`)
      .join("  "),
  );
  console.log(
    `Detected=${overall.detected}  Valid=${overall.valid}  Score=${overall.score.toFixed(2)}%   (CompileError + Ignored excluded)`,
  );

  // Per-file score
  if (!survivedOnly) {
    const byFile = new Map();
    for (const m of mutants) {
      if (!byFile.has(m.file)) byFile.set(m.file, []);
      byFile.get(m.file).push(m);
    }
    const rows = [...byFile.entries()]
      .map(([file, ms]) => ({ file, ...scoreOf(ms) }))
      .sort((a, b) => a.score - b.score);
    console.log("\n=== PER-FILE score (worst first) ===");
    for (const r of rows) {
      const surv = (r.counts.Survived ?? 0) + (r.counts.NoCoverage ?? 0);
      const tag = surv > 0 ? `  ⟵ ${surv} to triage` : "";
      console.log(
        `  ${fmt(r.score)}%  ${r.detected}/${r.valid}  ${r.file}${tag}`,
      );
    }
  }

  // Survivors + verdicts
  const survivors = mutants.filter(
    (m) => m.status === "Survived" || m.status === "NoCoverage",
  );
  if (survivors.length === 0) {
    console.log("\n=== SURVIVED / NOCOVERAGE: none. ===");
    return;
  }

  const killedByLine = killedMutatorsByLine(mutants);
  console.log(
    "\n=== SURVIVED / NOCOVERAGE — verdict is STRUCTURAL (suppress-safety), NOT equivalence ===",
  );
  console.log(
    "    Prove equivalence by injection (mutation + full suite green) before any disable.\n",
  );

  // group by file → line
  const byFileLine = new Map();
  for (const m of survivors) {
    const key = `${m.file} ${m.line}`;
    if (!byFileLine.has(key)) byFileLine.set(key, []);
    byFileLine.get(key).push(m);
  }

  let lastFile = "";
  const sortedKeys = [...byFileLine.keys()].sort((a, b) => {
    const [fa, la] = a.split(" ");
    const [fb, lb] = b.split(" ");
    return fa === fb ? Number(la) - Number(lb) : fa < fb ? -1 : 1;
  });

  for (const key of sortedKeys) {
    const group = byFileLine.get(key);
    const { file, line } = group[0];
    if (file !== lastFile) {
      console.log(`### ${file}`);
      lastFile = file;
    }
    const killedHere = killedByLine.get(`${file}:${line}`) ?? new Set();
    const safeMutators = new Set();

    for (const m of group.sort((a, b) => a.col - b.col)) {
      const loc = `L${line}:${m.col}-${m.endLine}:${m.endCol}`;
      const repl = JSON.stringify(m.replacement).slice(0, 50);
      const entangled = killedHere.has(m.mutator);
      const noCov = m.status === "NoCoverage";
      let verdict;
      if (entangled) {
        verdict = `ENTANGLED-KEEP (${m.mutator} also Killed on this line — document, do not disable)`;
      } else if (noCov) {
        verdict =
          "NOCOV — intentional? (default-param / v8-ignore) → disable or document; else a real coverage gap";
        safeMutators.add(m.mutator);
      } else {
        verdict =
          "DISABLE-SAFE (no Killed sibling of this mutator on the line)";
        safeMutators.add(m.mutator);
      }
      console.log(`  ${loc}  ${m.mutator}  repl=${repl}`);
      console.log(`      → ${verdict}`);
    }

    if (safeMutators.size > 0) {
      console.log(
        `      ┌ suggest: // Stryker disable next-line ${[...safeMutators].join(",")}: equivalent — <PROVEN reason>`,
      );
    }
  }
}

function dumpLines(mutants, specs) {
  // specs: array of "relpath:n,n,n"
  const wanted = new Map(); // fileSuffix → Set<line>
  for (const spec of specs) {
    const idx = spec.lastIndexOf(":");
    if (idx < 0) fail(`--lines expects <file>:<n,n>, got "${spec}"`);
    const file = spec.slice(0, idx);
    const lines = spec
      .slice(idx + 1)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
    if (lines.length === 0) fail(`--lines "${spec}" has no valid line numbers`);
    wanted.set(file, new Set(lines));
  }

  for (const [fileSuffix, lines] of wanted) {
    const hits = mutants
      .filter((m) => m.file.endsWith(fileSuffix) && lines.has(m.line))
      .sort((a, b) => a.line - b.line || a.col - b.col);
    console.log(`\n=== ${fileSuffix} @ lines ${[...lines].join(",")} ===`);
    if (hits.length === 0) {
      console.log("  (no mutants — check the path suffix and line numbers)");
      continue;
    }
    for (const m of hits) {
      const loc = `L${m.line}:${m.col}-${m.endLine}:${m.endCol}`;
      const repl = JSON.stringify(m.replacement).slice(0, 50);
      console.log(
        `  ${m.status.padEnd(12)} ${m.mutator.padEnd(22)} ${loc}  repl=${repl}`,
      );
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const lineSpecs = [];
  let survivedOnly = false;
  let target;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lines") {
      const next = argv[++i];
      if (!next) fail("--lines needs an argument like src/foo.ts:92,238");
      lineSpecs.push(next);
    } else if (a === "--survived-only") {
      survivedOnly = true;
    } else if (a.startsWith("--")) {
      fail(`unknown flag "${a}" (try --help)`);
    } else if (target === undefined) {
      target = a;
    } else {
      fail(`unexpected extra argument "${a}"`);
    }
  }
  if (target === undefined) fail("missing <target> (try --help)");

  const reportPath = resolveReportPath(target);
  console.log(`report: ${reportPath}\n`);
  const mutants = loadMutants(reportPath);

  if (lineSpecs.length > 0) {
    dumpLines(mutants, lineSpecs);
  } else {
    aggregate(mutants, { survivedOnly });
  }
}

main();
