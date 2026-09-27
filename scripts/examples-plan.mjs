#!/usr/bin/env node
// examples-plan.mjs — which examples a pull request builds.
//
//   node scripts/examples-plan.mjs <base> <head> >> "$GITHUB_OUTPUT"
//   node scripts/examples-plan.mjs --missing-lint
//
// prints `examples_filter=--filter=<name> …` for the examples workspace, empty
// when none. An example is in the set when the range edits a file inside its
// directory. A change to one of the workspace's own files — the files directly
// under `examples/`: its manifest, lockfile, pnpm settings, pnpmfile, ESLint and
// prettier configs — puts every example in the set, since each builds against
// them.
//
// `--missing-lint` names every package without a `lint:example` script and
// exits 1 when there is one: `pnpm -r run lint:example` skips such a package
// without a word, so the weekly lint would pass it unread.
//
// ⚠ Dependents are not followed. Every example depends on core, so following
// them would build all of them on any library change — measured on PR #1642,
// 156 tasks and 5m23s on the gate's critical path for a core-only diff. A
// library change that breaks an example is the weekly `examples.yml`'s to find,
// against this checkout's tarballs.

import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The `packages:` globs of a pnpm-workspace.yaml — a plain list of quoted
 * strings, which is all this file holds under that key.
 *
 * @param {string} yaml
 * @returns {string[]}
 */
export function workspaceGlobs(yaml) {
  const block = /^packages:\n((?:[ \t]+-[^\n]*\n?)+)/m.exec(yaml);

  if (!block) throw new Error("examples-plan: no `packages:` list");

  return [...block[1].matchAll(/-\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

/**
 * The workspace's packages, as `{ name, dir }` with `dir` relative to the
 * repository root.
 *
 * @param {string} examplesDir absolute path of `examples/`
 * @returns {{ name: string, dir: string }[]}
 */
export function examplePackages(examplesDir) {
  const globs = workspaceGlobs(
    readFileSync(path.join(examplesDir, "pnpm-workspace.yaml"), "utf8"),
  );
  const dirs = new Set(
    globs.flatMap((glob) =>
      globSync(`${glob}/package.json`, { cwd: examplesDir }).map((file) =>
        path.dirname(file),
      ),
    ),
  );

  return [...dirs]
    .toSorted()
    .map((dir) => ({
      name: JSON.parse(
        readFileSync(path.join(examplesDir, dir, "package.json"), "utf8"),
      ).name,
      dir: path.relative(ROOT, path.join(examplesDir, dir)),
    }));
}

/**
 * The examples a set of changed files reaches.
 *
 * @param {string[]} changed repository-relative paths, `git diff --name-only`
 * @param {{ name: string, dir: string }[]} packages
 * @returns {string[]} package names, sorted
 */
export function planExamples(changed, packages) {
  // A file directly under examples/ is the workspace's own configuration.
  if (changed.some((file) => /^examples\/[^/]+$/.test(file))) {
    return packages.map((pkg) => pkg.name).toSorted();
  }

  // The trailing slash keeps `web/react/combined` from claiming a file under
  // `web/react/combined-ssr`.
  return packages
    .filter(({ dir }) => changed.some((file) => file.startsWith(`${dir}/`)))
    .map((pkg) => pkg.name)
    .toSorted();
}

/**
 * The packages that declare no `lint:example` script.
 *
 * @param {{ name: string, dir: string }[]} packages
 * @returns {string[]}
 */
export function missingLintScript(packages) {
  return packages
    .filter(({ dir }) => {
      const { scripts = {} } = JSON.parse(
        readFileSync(path.join(ROOT, dir, "package.json"), "utf8"),
      );

      return !("lint:example" in scripts);
    })
    .map((pkg) => pkg.name);
}

export function main(argv) {
  const examplesDir = path.join(ROOT, "examples");

  if (argv[0] === "--missing-lint") {
    const missing = missingLintScript(examplePackages(examplesDir));

    if (missing.length > 0) {
      throw new Error(
        `examples-plan: no lint:example script in ${missing.join(", ")}`,
      );
    }
    process.stdout.write("every examples package declares lint:example\n");

    return;
  }

  const [base, head] = argv;

  if (!base || !head) {
    throw new Error("usage: examples-plan.mjs <base> <head>");
  }

  if (!existsSync(path.join(examplesDir, "pnpm-workspace.yaml"))) {
    throw new Error("examples-plan: examples/ is not a pnpm workspace");
  }

  const changed = execFileSync("git", ["diff", "--name-only", base, head], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const names = planExamples(changed, examplePackages(examplesDir));

  process.stdout.write(
    `examples_filter=${names.map((name) => `--filter=${name}`).join(" ")}\n`,
  );
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
