#!/usr/bin/env node
/**
 * Design-doc anchor guard.
 *
 * The `.claude/**` design documents cite the code by `file:line` — the RFC that
 * prompted this one carries 163 such anchors across 42 files. They rot silently:
 * the code moves, the document does not, and the only thing that has ever caught
 * a stale anchor is a human re-reading the region. Every audit wave over that RFC
 * has returned a batch of them.
 *
 * This resolves each anchor mechanically. What it CAN prove:
 *   - the named file exists, and the name identifies exactly one file;
 *   - the line (or range) is inside it.
 *
 * What it deliberately does NOT prove: that the line still holds what the
 * document says it holds. Content drift needs the quoted fragment, and the docs
 * do not quote consistently enough to check it — so anchors landing on a blank
 * line or a bare closer are reported as WARNINGS (a strong drift smell), not
 * errors. An honest partial gate beats a gate that pretends.
 *
 * Anchor forms understood (all inside inline-code spans):
 *   `packages/core/src/limits.ts:24`   full path
 *   `hash-plugin/src/plugin.ts:151`    path suffix
 *   `limits.ts:24`                     bare basename
 *   `guards.ts:176-178`                range
 *   `:1132`                            inherits the nearest preceding named file
 *
 * Usage: node scripts/check-doc-anchors.mjs [file-or-dir ...]
 * Default scope: every `.claude/**\/*.md` in the repo. Design docs are
 * gitignored, so this is a local gate, not a CI one — it runs against whatever
 * is on disk.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".turbo",
  "build",
  ".next",
  "playwright-report",
]);
const CODE_EXT =
  /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx|md|json|ya?ml|svelte|vue|html|sh)$/;

/** Every file in the repo, once — anchors resolve by path SUFFIX against this. */
function indexRepo(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // A git worktree under `.claude/worktrees/` is a SECOND copy of every
      // source file. Indexed, it makes every anchor in the repo ambiguous
      // against a checkout that may be months stale — the guard would report
      // nothing but noise.
      if (
        relative(ROOT, join(dir, entry.name)) === join(".claude", "worktrees")
      )
        continue;
      // ⚠ The tree is LIVE — this walk runs beside whatever else is touching
      // the checkout, and a directory listed a moment ago can be gone before
      // it is opened. Measured: `scripts/*.test.mjs` run one process per file,
      // and `check-angular-dom-utils-sync.mjs` re-syncs
      // `packages/angular/src/dom-utils` with an `rmSync` + `cpSync` pair while
      // this file's own tests walk the repo — 3 crashes in 100 walks under a
      // tight churn loop, and one red CI job.
      //
      // Skipping is the right answer rather than merely the safe one: a
      // directory that no longer exists holds no files to index. The cost is
      // that an anchor INTO such a directory reports "no such file" for that
      // one run — a wrong verdict instead of a stack trace, and only while
      // something is rewriting the tree underneath.
      try {
        indexRepo(join(dir, entry.name), out);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    } else if (entry.isFile()) {
      out.push(relative(ROOT, join(dir, entry.name)));
    }
  }
  return out;
}

function collectDocs(target, out = []) {
  const st = statSync(target);
  if (st.isFile()) {
    if (target.endsWith(".md")) out.push(target);
    return out;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // Same reason as the index: a worktree carries a second copy of every doc.
      if (
        relative(ROOT, join(target, entry.name)) ===
        join(".claude", "worktrees")
      )
        continue;
      collectDocs(join(target, entry.name), out);
    } else if (entry.name.endsWith(".md")) {
      out.push(join(target, entry.name));
    }
  }
  return out;
}

/** Default scope: the design docs, wherever they live. */
function defaultDocs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.name === ".claude") collectDocs(full, out);
    else defaultDocs(full, out);
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => a !== "--all");
const checkAll = process.argv.includes("--all");

/**
 * ⚑ Enrolment is OPT-IN, by the `<!-- anchors-root: … -->` directive.
 *
 * Measured when this was written: 2406 anchors across `.claude/**` do not
 * resolve. Nearly all of them sit in DATED research and audit documents —
 * `rfc-…-2026-07-29.md`, `audit/…`, `v2-materials/…` — which describe the code
 * as it stood on their date. An anchor there is a historical record, and
 * "fixing" it would rewrite the record. A gate that reds on 2406 of those is
 * not a gate; it is noise that gets muted.
 *
 * So a document joins the gate by declaring its root, which is the same line
 * the resolver needs to read short names. One mechanism, two jobs, and the
 * default run stays green — which is the only reason it will survive.
 * `--all` checks everything, for the occasional sweep.
 */
const allDocs = args.length
  ? args.flatMap((a) => collectDocs(a))
  : defaultDocs(ROOT);
const docs =
  args.length || checkAll
    ? allDocs
    : allDocs.filter((d) =>
        /<!--\s*anchors-root:/.test(readFileSync(d, "utf8")),
      );
const skipped = allDocs.length - docs.length;

const repoFiles = indexRepo(ROOT);
const lineCache = new Map();

function lineCount(path) {
  if (!lineCache.has(path)) {
    lineCache.set(path, readFileSync(join(ROOT, path), "utf8").split("\n"));
  }
  return lineCache.get(path);
}

const suffixMatches = (files, needle) =>
  files.filter(
    (f) => f === needle || f.endsWith(sep + needle) || f.endsWith("/" + needle),
  );

/**
 * A name resolves only if it identifies exactly ONE file.
 *
 * Order matters, and the document's own root is what makes short names legal:
 * a core RFC writes `helpers.ts` and means core's, while 56 files in this repo
 * carry that basename. Without a root the honest answer is "ambiguous", and the
 * doc would have to spell every path in full.
 *
 *   1. exact hit at the doc root       `helpers.ts` -> <root>/helpers.ts
 *   2. unique suffix hit under the root
 *   3. unique suffix hit repo-wide     `hash-plugin/src/plugin.ts`
 */
function resolve(name, root) {
  const needle = name.startsWith("/") ? name.slice(1) : name;

  if (root) {
    const atRoot = `${root}/${needle}`;
    if (repoFiles.includes(atRoot)) return { hits: [atRoot] };
    const underRoot = suffixMatches(
      repoFiles.filter((f) => f.startsWith(`${root}/`)),
      needle,
    );
    if (underRoot.length === 1) return { hits: underRoot };
    if (underRoot.length > 1) return { hits: underRoot };
  }

  const exact = repoFiles.filter((f) => f === needle);
  if (exact.length === 1) return { hits: exact };
  return { hits: suffixMatches(repoFiles, needle) };
}

const NAMED = new RegExp(`^([A-Za-z0-9_@./-]+${CODE_EXT.source.slice(1)})$`);
const errors = [];
const warnings = [];
let checked = 0;

for (const doc of docs) {
  const rel = relative(ROOT, doc);
  const text = readFileSync(doc, "utf8");
  const lines = text.split("\n");
  const rootDirective = text.match(/<!--\s*anchors-root:\s*([^\s>]+)\s*-->/);
  const root = rootDirective ? rootDirective[1].replace(/\/$/, "") : undefined;
  let context;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // ⚑ A bare `:NNN` inherits the nearest file named BEFORE it — and that
    // inheritance is the doc's most dangerous form, because it silently
    // survives a section boundary: an anchor written for one file resolves
    // against whatever was named last, and only a line number that overshoots
    // that file's length gives it away. Inheritance therefore dies at a blank
    // line: within a paragraph it is what the reader does anyway, across one it
    // is a guess.
    if (line.trim() === "") context = undefined;

    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const span = m[1];
      const named = span.match(
        /^([A-Za-z0-9_@./-]+\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx|md|json|ya?ml|svelte|vue|html|sh))(?::(\d+)(?:-(\d+))?)?$/,
      );
      const bare = span.match(/^:(\d+)(?:-(\d+))?$/);
      if (!named && !bare) continue;

      const where = `${rel}:${i + 1}`;
      let file, a, b;

      if (named) {
        [, file, a, b] = named;
        context = file;
        if (a === undefined) continue; // a bare filename only sets context
      } else {
        if (!context) {
          errors.push(`${where}  \`${span}\` — no preceding file to attach to`);
          continue;
        }
        file = context;
        [, a, b] = bare;
      }

      checked++;
      const { hits } = resolve(file, root);
      if (hits.length === 0) {
        errors.push(`${where}  \`${span}\` — no such file: ${file}`);
        continue;
      }
      if (hits.length > 1) {
        errors.push(
          `${where}  \`${span}\` — ambiguous: ${hits.slice(0, 4).join(", ")}${
            hits.length > 4 ? ` (+${hits.length - 4})` : ""
          }; qualify the path`,
        );
        continue;
      }

      const body = lineCount(hits[0]);
      const total = body.length;
      const start = Number(a);
      const end = b === undefined ? start : Number(b);

      if (start < 1 || start > total || end > total) {
        errors.push(
          `${where}  \`${span}\` — ${hits[0]} has ${total} lines, anchor points past the end`,
        );
        continue;
      }
      if (end < start) {
        errors.push(`${where}  \`${span}\` — inverted range`);
        continue;
      }

      const target = body[start - 1];
      if (target.trim() === "") {
        warnings.push(
          `${where}  \`${span}\` — lands on a BLANK line in ${hits[0]}`,
        );
      } else if (/^[\s}\])?;,]*$/.test(target)) {
        warnings.push(
          `${where}  \`${span}\` — lands on a bare closer (\`${target.trim()}\`) in ${hits[0]}`,
        );
      }
    }
  }
}

if (warnings.length > 0) {
  console.error(`⚠ ${warnings.length} anchor(s) smell of drift:\n`);
  for (const w of warnings) console.error(`  - ${w}`);
  console.error("");
}

if (errors.length > 0) {
  console.error(`✖ Doc-anchor drift detected — ${errors.length} broken:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nFix: re-resolve the anchor against the code, or qualify an ambiguous name" +
      "\nwith enough path to be unique. See scripts/check-doc-anchors.mjs.",
  );
  process.exit(1);
}

console.error(
  `✓ ${checked} anchors resolve across ${docs.length} enrolled doc(s)` +
    (warnings.length ? ` (${warnings.length} warning(s))` : "") +
    (skipped ? `; ${skipped} doc(s) not enrolled (no anchors-root)` : ""),
);
