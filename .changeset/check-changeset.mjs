#!/usr/bin/env node
/**
 * Changeset validity linter (pre-push fast-block).
 *
 * Problem: `.changeset/README.md` documents a set of rules every changeset must
 * obey (quoted package names, valid bump level, public packages only, PR/issue
 * reference, one package per file). The CI workflow `changeset-check.yml` only
 * checks that a changeset *exists* when public src changes — it never validates
 * the *contents*. A malformed changeset (unknown package, typo'd bump level,
 * private package, missing #ref) therefore slips through every gate until it
 * blows up — or silently misbehaves — at `changeset version` on the release run.
 *
 * Solution: validate every pending `.changeset/*.md` against the machine-checkable
 * subset of those rules, on pre-push, before the heavy build (fail-fast). No
 * changeset files present → exit 0 (a WIP push or an infra-only push is fine;
 * the "changeset required" question stays in CI). Files present but invalid →
 * exit 1 and block the push.
 *
 * Why a separate script (not the CI workflow): the rules are policy that the
 * author should hear *before* push, not after a red CI round-trip. The package
 * registry (name → private/version) is read straight from each package.json,
 * so "unknown package" and "private package" can never drift from reality.
 *
 * NOT checked here (semantic — not derivable from the file text): "one logical
 * change per file", "don't mix features/fixes", "right bump for the change type",
 * "descriptive title". Those need understanding of the diff, not the changeset.
 *
 * Two consumers, one validator (no drift):
 *   - pre-push CLI: `node check-changeset.mjs` → human-readable, exit 1 on error.
 *   - CI `changeset-check.yml`: `node check-changeset.mjs --json` → emits
 *     `[{ file, errors, warnings }]` for the workflow's PR-comment step, exit 1
 *     on any error. Replaces the hand-rolled bash re-implementation of these same
 *     four checks (PR-ref / multi-package / private / major) that used to live in
 *     the workflow and could silently drift from this script's rules.
 *
 * `main()` only runs when invoked as a CLI (the `import.meta` guard below).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const CHANGESET_DIR = join(ROOT, ".changeset");
const PKG_DIR = join(ROOT, "packages");
const VALID_LEVELS = new Set(["major", "minor", "patch"]);

/**
 * Registry of workspace packages: name → { private, version }.
 * Source of truth for "unknown package" and "private package" checks.
 * @returns {Map<string, { private: boolean, version: string }>}
 */
function loadPackages() {
  const registry = new Map();
  for (const entry of readdirSync(PKG_DIR)) {
    const pkgJsonPath = join(PKG_DIR, entry, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      if (pkg.name) {
        registry.set(pkg.name, {
          private: pkg.private === true,
          version: typeof pkg.version === "string" ? pkg.version : "0.0.0",
        });
      }
    } catch {
      // A package.json we can't parse isn't our concern here — other gates own it.
    }
  }
  return registry;
}

/**
 * Validate a single changeset file's content.
 * @param {string} name file name (e.g. "foo-fix.md")
 * @param {string} content raw file content
 * @param {Map<string, { private: boolean, version: string }>} registry
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateChangeset(name, content, registry) {
  const errors = [];
  const warnings = [];

  // File-naming convention (kebab-case) — cosmetic, so warn, never block.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(name)) {
    warnings.push(
      `file name is not kebab-case (e.g. "middleware-unsubscribe-fix.md")`,
    );
  }

  // Frontmatter must be present and terminated.
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    errors.push("missing or unterminated YAML frontmatter (--- … ---)");
    return { errors, warnings };
  }

  // Parse frontmatter entries — one `"package": level` per non-empty line.
  const entries = [];
  let nonEmptyLines = 0;
  for (const rawLine of fm[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    nonEmptyLines++;

    const quoted = line.match(/^"([^"]+)":\s*(\S+)\s*$/);
    if (quoted) {
      entries.push({ pkg: quoted[1], level: quoted[2] });
      continue;
    }
    // Unquoted "pkg: level" — the most common malformation (README pitfall).
    const unquoted = line.match(/^([^":\s][^:]*):\s*(\S+)\s*$/);
    if (unquoted) {
      errors.push(
        `package name must be quoted: \`"${unquoted[1].trim()}": ${unquoted[2]}\``,
      );
      continue;
    }
    errors.push(`unparseable frontmatter line: \`${line}\``);
  }

  // At least one package entry. Only flag emptiness when the frontmatter was
  // genuinely blank — if lines were present but malformed, the per-line errors
  // above already explain it (don't pile on a confusing "no packages").
  if (entries.length === 0 && nonEmptyLines === 0) {
    errors.push("frontmatter lists no packages");
  }

  // One package per file (project convention + CI Integration section of README).
  if (entries.length > 1) {
    errors.push(
      `${entries.length} packages in one file — split into one changeset per package`,
    );
  }

  for (const { pkg, level } of entries) {
    if (!VALID_LEVELS.has(level)) {
      errors.push(
        `invalid bump level "${level}" for "${pkg}" (must be major | minor | patch)`,
      );
      continue;
    }
    const meta = registry.get(pkg);
    if (!meta) {
      errors.push(`unknown package "${pkg}" — not a workspace package`);
      continue;
    }
    if (meta.private) {
      errors.push(
        `"${pkg}" is private — changeset the public consumer whose behavior changed`,
      );
    }
    // Pre-1.0 (0.x) packages never take a major bump (README pre-1.0 guideline;
    // mirrors cap-major-bumps.mjs). Auto-relaxes once a package reaches 1.0.
    if (level === "major" && /^0\./.test(meta.version)) {
      errors.push(
        `"${pkg}" is pre-1.0 (${meta.version}) — use "minor" for breaking changes, not "major"`,
      );
    }
  }

  // PR/issue reference (#NN) somewhere in the body (traceability in release notes).
  const body = content.slice(fm[0].length);
  if (!/#\d+/.test(body)) {
    errors.push("missing PR/issue reference (#NN) in the description");
  }

  return { errors, warnings };
}

/**
 * Validate every pending changeset and return one result per file.
 * Pure (no I/O side effects beyond reading): the CLI and the JSON consumer
 * share this so the rules can never diverge.
 * @returns {{ file: string, errors: string[], warnings: string[] }[]}
 */
function validateAll() {
  if (!existsSync(CHANGESET_DIR)) return [];

  const files = readdirSync(CHANGESET_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();

  if (files.length === 0) return [];

  const registry = loadPackages();
  return files.map((file) => {
    const content = readFileSync(join(CHANGESET_DIR, file), "utf8");
    const { errors, warnings } = validateChangeset(file, content, registry);
    return { file: `.changeset/${file}`, errors, warnings };
  });
}

function main() {
  const jsonMode = process.argv.includes("--json");
  const results = validateAll();
  const invalid = results.filter((r) => r.errors.length > 0).length;

  // CI consumer: machine-readable for changeset-check.yml's PR-comment step.
  if (jsonMode) {
    console.log(JSON.stringify(results));
    if (invalid > 0) process.exit(1);
    return;
  }

  // pre-push CLI: human-readable.
  if (results.length === 0) {
    console.log("📝 No changesets to validate.");
    return;
  }

  let warned = 0;
  for (const { file, errors, warnings } of results) {
    for (const w of warnings) {
      console.warn(`⚠️  ${file}: ${w}`);
      warned++;
    }
    for (const e of errors) {
      console.error(`❌ ${file}: ${e}`);
    }
  }

  if (invalid > 0) {
    console.error(
      `\n❌ ${invalid} of ${results.length} changeset file(s) invalid. ` +
        `Fix them before pushing.\n` +
        `   Rules: .changeset/README.md`,
    );
    process.exit(1);
  }

  const suffix = warned > 0 ? ` (${warned} warning(s))` : "";
  console.log(`✅ ${results.length} changeset file(s) valid${suffix}.`);
}

// Run only as a CLI — `import` must not trigger validation.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
