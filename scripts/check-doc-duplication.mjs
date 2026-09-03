#!/usr/bin/env node
/**
 * Docblock-vs-doc duplication guard.
 *
 * A rule written in two places goes stale in one of them and is believed anyway,
 * because the stale copy sits next to the code. Measured: the `UNSAFE_KEY`
 * docblock had grown into a second copy of `INVARIANTS.md`'s hand-out section,
 * and the two had diverged on a countable fact — one said FOUR exempt doors and
 * the other FIVE, because the seam that changed at #1986 was heard by one copy.
 *
 * This reports docblock sentences that RESTATE a sentence from the owning
 * package's own docs. What it deliberately does NOT do is judge whether the two
 * still agree: divergence needs reading, and a checker that pretended otherwise
 * would be the more expensive kind of green.
 *
 * So it is a RATCHET rather than a gate on a number — everything standing today
 * is in `doc-duplication-baseline.json`, and only a NEW pair fails.
 *
 * ⚠ The baseline is keyed by the docblock sentence's CONTENT, not by its line.
 * A line-keyed baseline goes stale on the first edit above it, silently.
 * Editing a doc alone therefore does not re-surface a pair; editing the
 * docblock half does.
 *
 * Usage: node scripts/check-doc-duplication.mjs [--update] [--all]
 *   --update  rewrite the baseline from what is on disk
 *   --all     list every pair, not only the new ones
 *   --root=D  scan D instead of the repository (the mutation guard uses it)
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const rootArg = process.argv.slice(2).find((a) => a.startsWith("--root="));

/** `--root=` exists for the mutation guard, which needs a tree it can poison. */
const ROOT = rootArg
  ? rootArg.slice("--root=".length)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = rootArg
  ? join(ROOT, "doc-duplication-baseline.json")
  : join(ROOT, "scripts", "doc-duplication-baseline.json");

/** A docblock shorter than this is a description, not a policy document. */
const MIN_BLOCK_LINES = 30;
/** Below this, a sentence is too generic for containment to mean anything. */
const MIN_TOKENS = 8;
/** A short sentence inside a long paragraph scores 1.0 for free. */
const MAX_DOC_RATIO = 4;
const THRESHOLD = 0.55;

const STOP = new Set(
  (
    "the a an and or of to in is are that this it for on with as be by not but which where when what " +
    "does do so its their they them then than from at one two into no nor if"
  ).split(" "),
);

const walk = (dir, out = []) => {
  let entries;

  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;

    const p = join(dir, e);

    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }

  return out;
};

const sentences = (text, isComment) => {
  const flat = isComment
    ? text
        .replace(/^\s*\/\*\*|\*\/\s*$/g, "")
        .split("\n")
        .map((l) => l.replace(/^\s*\*\s?/, ""))
        .join(" ")
    : text.replace(/^[|#>\-\s]+/gm, " ");

  return flat
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
};

const toks = (s) => {
  const out = new Set();

  for (const m of s.matchAll(/`([^`]+)`/g))
    out.add("`" + m[1].toLowerCase() + "`");

  for (const w of s
    .toLowerCase()
    .replace(/`[^`]*`/g, " ")
    .match(/[a-z][a-z-]{3,}/g) ?? [])
    if (!STOP.has(w)) out.add(w);

  return out;
};

const containment = (a, b) => {
  let n = 0;

  for (const t of a) if (b.has(t)) n++;

  return a.size === 0 ? 0 : n / a.size;
};

/** `shared/` has no docs of its own; core owns the rules it implements. */
const pkgOf = (file) =>
  file.startsWith("shared/")
    ? "packages/core"
    : file.split("/").slice(0, 2).join("/");

const docsFor = (pkg) =>
  walk(join(ROOT, pkg))
    .map((p) => relative(ROOT, p))
    .filter(
      (p) =>
        p.endsWith(".md") &&
        !p.endsWith("CHANGELOG.md") &&
        p.split("/").length <= pkg.split("/").length + 2,
    );

const blocksOf = (file) => {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const out = [];
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();

    if (t.startsWith("/**") && !t.endsWith("*/")) start = i;
    else if (t === "*/" && start >= 0) {
      if (i - start + 1 >= MIN_BLOCK_LINES)
        out.push({
          line: start + 1,
          body: lines.slice(start, i + 1).join("\n"),
        });

      start = -1;
    }
  }

  return out;
};

const keyOf = (file, sentence) =>
  createHash("sha1")
    .update(file + " " + sentence.replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 12);

const sources = walk(join(ROOT, "packages"))
  .concat(walk(join(ROOT, "shared")))
  .map((p) => relative(ROOT, p))
  .filter(
    (p) =>
      /\/src\/|^shared\//.test(p) &&
      /\.(ts|tsx)$/.test(p) &&
      !p.endsWith(".d.ts"),
  );

const docCache = new Map();
const found = new Map();

for (const file of sources) {
  const blocks = blocksOf(file);

  if (blocks.length === 0) continue;

  const pkg = pkgOf(file);

  if (!docCache.has(pkg))
    docCache.set(
      pkg,
      docsFor(pkg).flatMap((d) =>
        sentences(readFileSync(join(ROOT, d), "utf8"), false).map((s) => [
          d,
          s,
          toks(s),
        ]),
      ),
    );

  for (const b of blocks)
    for (const s of sentences(b.body, true)) {
      const t = toks(s);

      if (t.size < MIN_TOKENS) continue;

      let best = [0, "", ""];

      for (const [df, ds, dt] of docCache.get(pkg)) {
        if (dt.size > t.size * MAX_DOC_RATIO) continue;

        const c = containment(t, dt);

        if (c > best[0]) best = [c, ds, df];
      }

      if (best[0] >= THRESHOLD)
        found.set(keyOf(file, s), {
          where: file + ":" + b.line,
          doc: best[2],
          pct: Math.round(best[0] * 100),
          code: s.replace(/\s+/g, " ").slice(0, 150),
          docText: best[1].replace(/\s+/g, " ").slice(0, 150),
        });
    }
}

if (args.has("--update")) {
  const obj = {};

  for (const [k, v] of [...found].sort((a, b) =>
    a[1].where.localeCompare(b[1].where),
  ))
    obj[k] = v.where + " -> " + v.doc + " (" + v.pct + "%)";

  writeFileSync(BASELINE, JSON.stringify(obj, null, 2) + "\n");
  console.error("baseline rewritten - " + found.size + " accepted pair(s)");
  process.exit(0);
}

let baseline = {};

try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(
    "FAIL " +
      relative(ROOT, BASELINE) +
      " is missing - run with --update to create it.",
  );
  process.exit(1);
}

if (args.has("--all"))
  for (const [k, v] of found)
    console.error(
      (k in baseline ? "  " : "+ ") +
        "[" +
        v.pct +
        "%] " +
        v.where +
        " -> " +
        v.doc,
    );

const added = [...found].filter(([k]) => !(k in baseline));
const gone = Object.keys(baseline).filter((k) => !found.has(k));

if (gone.length)
  console.error(
    "note: " +
      gone.length +
      " baselined pair(s) no longer match - run --update to drop them.\n",
  );

if (added.length === 0) {
  console.error(
    "OK no new docblock/doc duplication (" + found.size + " baselined).",
  );
  process.exit(0);
}

console.error(
  "FAIL " +
    added.length +
    " docblock sentence(s) restate the package's own docs:\n",
);

for (const [, v] of added) {
  console.error("  " + v.where + "  ->  " + v.doc + "  [" + v.pct + "%]");
  console.error("    code: " + v.code);
  console.error("    doc : " + v.docText + "\n");
}

console.error(
  "A rule with two homes goes stale in one of them. Point at the doc instead of\n" +
    "restating it - or, if this is a reference rather than a second copy, accept it\n" +
    "with `pnpm lint:doc-dup --update`.",
);
process.exit(1);
