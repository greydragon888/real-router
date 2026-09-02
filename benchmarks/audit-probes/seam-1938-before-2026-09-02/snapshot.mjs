#!/usr/bin/env node
/**
 * The "before" snapshot for #1938 — R5 and R6 of «Что схлопнется после шва».
 *
 * ⚑ It exists because BOTH questions compare a before with an after, and the
 * before stops existing the moment the first step of the seam move lands. Same
 * logic as the bench baseline: a delta measured against a number that only ever
 * lived on a branch is not a delta.
 *
 * Everything here is DERIVED from the tree, so the "after" run is the same
 * command and the two are comparable. Nothing is hand-listed except the address
 * set in PART A, which is named in the artifact and is the thing being tested.
 *
 *   node snapshot.mjs            # human table
 *   node snapshot.mjs --json     # machine-readable, for diffing two runs
 *
 * ⚠ **PART B's split is a LOWER BOUND on "deliberate", not a partition.** The unit
 * is a sentence and a deliberate doctrine is a BLOCK: only some of its sentences
 * carry the marker the classifier keys on, so the rest land in "unclassified".
 * Measured on this tree, the three largest groups are all the captured-intrinsics
 * doctrine (#1971) — 29, 20 and 20 homes across eight packages — and two of the
 * three fall on the wrong side of the split. Do not quote the unclassified figure
 * as a backlog. What this instrument is FOR is the delta between two runs of it.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const SHA = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const JSON_OUT = process.argv.includes("--json");

const tracked = (glob) =>
  execSync(`git -C "${ROOT}" ls-files -- ${glob}`, { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean);

const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

/**
 * Code vs prose, per line. Crude by construction and that is fine: the number is
 * only ever read as a DELTA against another run of this same classifier.
 */
function split(src) {
  let code = 0;
  let prose = 0;
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("//")) prose += 1;
    else code += 1;
  }
  return { code, prose };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A — the mass at the addresses the seam move is expected to delete
// ─────────────────────────────────────────────────────────────────────────────

const SCOPES = {
  "core/src": "packages/core/src",
  "persistent-params/src": "packages/persistent-params-plugin/src",
  "search-schema/src": "packages/search-schema-plugin/src",
  "validation-plugin/src": "packages/validation-plugin/src",
};

const scopeMass = {};
for (const [name, dir] of Object.entries(SCOPES)) {
  let code = 0;
  let prose = 0;
  for (const f of tracked(`'${dir}'`).filter((f) => f.endsWith(".ts"))) {
    const s = split(read(f));
    code += s.code;
    prose += s.prose;
  }
  scopeMass[name] = { code, prose, prosePct: code + prose === 0 ? 0 : Math.round((prose * 100) / (code + prose)) };
}

/** The seam's vocabulary. Each term dies or changes meaning under O-1b. */
const VOCAB = [
  "buildURLForCommit",
  "pendingRemovals",
  "ctx\\.buildPath",
  "port\\.buildPath",
  "buildPathFromIntent",
  "resolveForward",
  "interceptable",
];

// ⚠ Counted in JS over the tracked list, NOT with `git grep -- 'packages/*/src'`.
// The pathspec form silently matched nothing for some terms while matching for
// others, so the first run reported `buildURLForCommit` as absent from a tree
// that has it. A count that can be zero for the wrong reason is worse than none.
const VOCAB_SCOPE = tracked("'packages' 'shared'").filter((f) =>
  /\.(ts|tsx|mts|md)$/.test(f) && !f.includes("/dist/"),
);

const vocab = {};
for (const term of VOCAB) {
  const re = new RegExp(term, "g");
  let files = 0;
  let hits = 0;
  for (const f of VOCAB_SCOPE) {
    const n = (read(f).match(re) ?? []).length;
    if (n > 0) {
      files += 1;
      hits += n;
    }
  }
  vocab[term.replace(/\\/g, "")] = { files, hits };
}

/** The interception surface itself: who registers on the seam being retired. */
const seamSites = tracked("'packages/**/*.ts' 'shared/**/*.ts' 'examples/**/*.ts'").filter((f) =>
  /addInterceptor(<[^>]*>)?\s*\(\s*("|`|')buildPath\1/.test(read(f)),
);

// ─────────────────────────────────────────────────────────────────────────────
// PART B — prose copies: how many CLAIMS have more than one home (R6)
// ─────────────────────────────────────────────────────────────────────────────

const MIN_LEN = 60;

/** Prose only, normalised so formatting differences do not hide a copy. */
function proseSentences(src) {
  const lines = [];
  for (const raw of src.split("\n")) {
    let t = raw.trim();
    if (t.startsWith("* ")) t = t.slice(2);
    else if (t === "*" || t.startsWith("/**") || t.startsWith("*/")) continue;
    else if (t.startsWith("// ")) t = t.slice(3);
    else if (!raw.trimStart().startsWith("*") && !raw.trimStart().startsWith("//")) continue;
    lines.push(t);
  }
  // Re-flow: a docblock wraps one sentence over several lines.
  const flowed = lines.join(" ");
  return flowed
    .split(/(?<=[.!?])\s+/)
    .map((s) =>
      s
        .toLowerCase()
        .replace(/[`*_#|]/g, "")
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9а-я ]/gi, "")
        .trim(),
    )
    .filter((s) => s.length >= MIN_LEN);
}

const sentenceHomes = new Map();
const PROSE_SCOPE = ["'packages/*/src/**/*.ts'", "'shared/**/*.ts'"];
const proseFiles = tracked(PROSE_SCOPE.join(" "));

for (const f of proseFiles) {
  for (const s of proseSentences(read(f))) {
    if (!sentenceHomes.has(s)) sentenceHomes.set(s, new Set());
    sentenceHomes.get(s).add(f);
  }
}

const copied = [...sentenceHomes.entries()]
  .filter(([, homes]) => homes.size > 1)
  .map(([text, homes]) => ({ chars: text.length, files: [...homes], text }))
  .sort((a, b) => b.files.length - a.files.length || b.chars - a.chars);

/**
 * ⚑ Two families duplicate BY CONSTRUCTION, and counting them in makes the total
 * a fact about the architecture rather than about drift:
 *
 *  - `packages/angular/src/dom-utils` is a git-tracked COPY of `shared/dom-utils`
 *    (ng-packagr does not follow the symlink) — root `CLAUDE.md` says so and a
 *    pre-commit check keeps them equal;
 *  - the captured-intrinsics header (#1971) is a DOCTRINE, repeated verbatim on
 *    purpose so each capture site carries its own justification.
 *
 * Both are #1522's "declared independence" / "sync-guarded twin" stance, already
 * decided. The number that means anything is the rest.
 */
const isAngularCopy = (c) =>
  c.files.every((f) => f.startsWith("packages/angular/src/dom-utils/") || f.startsWith("shared/dom-utils/"));
/**
 * ⚠ Anchored on the doctrine's own MARKERS, not on a list of its sentences. The
 * first cut listed three phrases and classified 61 groups as unexplained — all
 * four of the largest turned out to be further sentences of the same doctrine
 * block. A hand list of fragments is the anti-pattern this whole census is about.
 */
const isIntrinsicsDoctrine = (c) =>
  /\b1971\b|\b1798\b|doctrine/.test(c.text);

const deliberate = copied.filter((c) => isAngularCopy(c) || isIntrinsicsDoctrine(c));
const unclassified = copied.filter((c) => !isAngularCopy(c) && !isIntrinsicsDoctrine(c));
const filesInvolved = new Set(unclassified.flatMap((c) => c.files));

// ─────────────────────────────────────────────────────────────────────────────

const snapshot = {
  sha: SHA,
  takenAt: new Date().toISOString().slice(0, 10),
  minSentenceChars: MIN_LEN,
  scopeMass,
  vocab,
  seamSites: { count: seamSites.length, files: seamSites },
  proseCopies: {
    filesScanned: proseFiles.length,
    sentencesScanned: sentenceHomes.size,
    claimsWithMoreThanOneHome: copied.length,
    deliberate: deliberate.length,
    unclassified: unclassified.length,
    filesInvolved: filesInvolved.size,
    top: unclassified.slice(0, 12).map((c) => ({ homes: c.files.length, chars: c.chars, files: c.files })),
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(snapshot, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n#1938 — снимок «ДО»    ${SHA}    ${snapshot.takenAt}\n`);

  console.log("A1 · масса по областям (строк)");
  for (const [k, v] of Object.entries(scopeMass)) {
    console.log(`   ${pad(k, 24)} код ${pad(v.code, 7)} проза ${pad(v.prose, 7)} проза ${v.prosePct} %`);
  }

  console.log("\nA2 · словарь шва (файлов / вхождений)");
  for (const [k, v] of Object.entries(vocab)) {
    console.log(`   ${pad(k, 24)} ${pad(v.files, 4)} / ${v.hits}`);
  }

  console.log(`\nA3 · регистрации на выводимом шве: ${seamSites.length} файлов`);
  for (const f of seamSites) console.log(`   ${f}`);

  const p = snapshot.proseCopies;
  console.log(`\nB · копии прозы (предложения ≥ ${MIN_LEN} симв., ${p.filesScanned} файлов)`);
  console.log(`   уникальных предложений          ${p.sentencesScanned}`);
  console.log(`   клеймов больше чем в одном доме ${p.claimsWithMoreThanOneHome}`);
  console.log(`     из них НАМЕРЕННЫХ             ${p.deliberate}  (angular-копия dom-utils + доктрина #1971)`);
  console.log(`     НЕклассифицированных          ${p.unclassified}  ← это и есть предмет #2091`);
  console.log(`   файлов в неклассифицированных   ${p.filesInvolved}`);
  console.log("\n   самые размноженные из неклассифицированных:");
  for (const c of p.top) console.log(`   ${pad(c.homes + " домов", 10)} ${c.chars} симв.  ${c.files[0]} …`);
  console.log();
}
