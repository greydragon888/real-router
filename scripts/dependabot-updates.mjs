#!/usr/bin/env node
// dependabot-updates.mjs — the updates a Dependabot PR carries, read off its commits.
//
//   git log --format=%B origin/master..<branch> | node scripts/dependabot-updates.mjs
//     prints `<name>@<version>`, one per line
//   … | node scripts/dependabot-updates.mjs --check <lockfile>
//     exit 1 when an update is not in the lockfile at its version or above
//
// Dependabot writes the updates into its commit message as an
// `updated-dependencies` YAML block. `resolve-dependabot.sh` re-applies them
// after it rebuilds a conflicted lockfile from the manifests — a bump inside a
// `~` range changes no manifest, so the rebuild alone drops it — and checks them
// at the end, so a dropped update fails the run rather than shipping an empty PR.

import { readFileSync } from "node:fs";

/** @typedef {{ name: string, version: string }} Update */

/** A YAML scalar without its quotes: Dependabot quotes a scoped name, and some versions. */
const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/u, "$2");

/**
 * The updates named in the `updated-dependencies` blocks of `text`, one per
 * package. `git log` lists the newest commit first, so its version wins. An entry
 * without a `dependency-version` names nothing to re-apply and is skipped.
 *
 * @param {string} text commit messages, any number of them
 * @returns {Update[]}
 */
export function updatedDependencies(text) {
  /** @type {Map<string, Update>} */
  const updates = new Map();
  let inBlock = false;
  /** @type {string | undefined} */
  let name;

  for (const line of text.split("\n")) {
    if (line.trim() === "updated-dependencies:") {
      inBlock = true;
      name = undefined;
    } else if (inBlock && line.trim() === "...") {
      inBlock = false;
    } else if (inBlock) {
      const entry = /^- dependency-name:\s*(.+)$/u.exec(line);
      const version = /^\s+dependency-version:\s*(.+)$/u.exec(line);

      if (entry) {
        name = unquote(entry[1]);
      } else if (version && name !== undefined) {
        if (!updates.has(name)) {
          updates.set(name, { name, version: unquote(version[1]) });
        }
        name = undefined;
      }
    }
  }

  return [...updates.values()];
}

/**
 * The versions a pnpm lockfile holds for each package, read off the keys of its
 * `packages` and `snapshots` sections: `name@1.2.3:`, `'@scope/name@1.2.3':`,
 * `name@1.2.3(peer@4.5.6):`.
 *
 * @param {string} lockfile
 * @returns {Map<string, Set<string>>}
 */
export function lockedVersions(lockfile) {
  /** @type {Map<string, Set<string>>} */
  const versions = new Map();
  const key = /^ {2}'?((?:@[^@/\s']+\/)?[^@\s'(]+)@(\d[^(:'\s]*)/gmu;

  for (const [, name, version] of lockfile.matchAll(key)) {
    const held = versions.get(name) ?? new Set();

    held.add(version);
    versions.set(name, held);
  }

  return versions;
}

/**
 * Whether version `a` is `b` or above: `major.minor.patch` compared as numbers,
 * a prerelease below its release.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function atLeast(a, b) {
  const split = (/** @type {string} */ v) => {
    const at = v.indexOf("-");
    const core = at === -1 ? v : v.slice(0, at);

    return {
      parts: core.split(".").map(Number),
      pre: at === -1 ? "" : v.slice(at + 1),
    };
  };
  const x = split(a);
  const y = split(b);

  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const diff = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);

    if (diff !== 0) return diff > 0;
  }
  if (x.pre === "" || y.pre === "") return x.pre === "";

  return x.pre.localeCompare(y.pre, "en", { numeric: true }) >= 0;
}

/**
 * The updates `lockfile` does not hold at their version or above, each with the
 * versions it does hold.
 *
 * @param {Update[]} updates
 * @param {string} lockfile
 * @returns {{ update: Update, held: string[] }[]}
 */
export function missingUpdates(updates, lockfile) {
  const versions = lockedVersions(lockfile);

  return updates
    .map((update) => ({
      update,
      held: [...(versions.get(update.name) ?? [])],
    }))
    .filter(({ update, held }) => !held.some((v) => atLeast(v, update.version)));
}

/**
 * @param {string} stdin commit messages
 * @param {string[]} args `[]` or `["--check", lockfile]`
 * @param {(file: string) => string} read
 * @returns {number} exit code
 */
export function main(stdin, args, read = (file) => readFileSync(file, "utf8")) {
  const updates = updatedDependencies(stdin);

  if (updates.length === 0) {
    process.stderr.write(
      "dependabot-updates: no updated-dependencies in the input\n",
    );
    return 0;
  }

  if (args[0] !== "--check") {
    process.stdout.write(
      updates.map(({ name, version }) => `${name}@${version}\n`).join(""),
    );
    return 0;
  }

  const lockfile = args[1];

  if (lockfile === undefined) {
    process.stderr.write("usage: dependabot-updates.mjs --check <lockfile>\n");
    return 2;
  }

  const missing = missingUpdates(updates, read(lockfile));

  for (const { update, held } of missing) {
    process.stderr.write(
      `❌ ${update.name}@${update.version} is not in ${lockfile} (it holds ${held.length > 0 ? held.join(", ") : "none"})\n`,
    );
  }
  if (missing.length > 0) return 1;

  process.stdout.write(
    `✓ ${String(updates.length)} update(s) in ${lockfile} at their version or above\n`,
  );
  return 0;
}

if (import.meta.main) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.exit(
    main(Buffer.concat(chunks).toString("utf8"), process.argv.slice(2)),
  );
}
