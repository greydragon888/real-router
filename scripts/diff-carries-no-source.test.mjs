// diff-carries-no-source.test.mjs — meta-tests for the predicate three CI
// checks consult before reading code (#2433).
//
// Run:  node --test scripts/diff-carries-no-source.test.mjs
//       (picked up by the `node --test scripts/*.test.mjs` step in ci.yml and
//       by the same step in .husky/pre-push)
//
// The predicate is consulted by SonarCloud's gate, by Codecov and by jscpd. A
// false positive — answering "no source" on a diff that has some — is a check
// silently not run on code that changed, which is the #1127 class: nothing goes
// red, the report just never happens. So the cells below spend most of their
// weight on the refusing direction, and the repository cells run the predicate
// over real history rather than over fixtures alone.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  carriesNoSource,
  isManifestOnlyPath,
  main,
  sourcePaths,
} from "./diff-carries-no-source.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });

/** Commits whose diff is what `changeset version` writes. */
const releaseCommits = () =>
  git("log", "--format=%H %s", "-n", "400", "--grep=^release: version packages")
    .split("\n")
    .filter(Boolean)
    .slice(0, 12);

const changedIn = (sha) =>
  git("diff", "--name-only", `${sha}^`, sha).split("\n").filter(Boolean);

/**
 * A file a code reader reads, selected by EXTENSION rather than by the
 * predicate's own rules — a filter written in terms of `isManifestOnlyPath`
 * would make the negative-control cell below true by construction.
 */
const SOURCE_FILE =
  /^(packages\/[^/]+\/(src|tests)|shared|scripts|benchmarks)\/.*\.(ts|tsx|mts|mjs|js|jsx|svelte|vue)$/;

test("the shape `changeset version` writes is accepted", () => {
  assert.equal(
    carriesNoSource([
      ".changeset/tidy-donkeys-shave.md",
      "packages/core/CHANGELOG.md",
      "packages/core/package.json",
      "packages/react/CHANGELOG.md",
      "packages/react/package.json",
      "pnpm-lock.yaml",
    ]),
    true,
  );
});

test("one source file in the diff refuses it", () => {
  const release = [
    "packages/core/CHANGELOG.md",
    "packages/core/package.json",
    "pnpm-lock.yaml",
  ];

  for (const intruder of [
    "packages/core/src/createRouter.ts",
    "shared/dom-utils/link-utils.ts",
    "scripts/ci-gate-completeness.test.mjs",
    ".github/workflows/ci.yml",
    "README.md",
    "examples/web/react/basic/src/App.tsx",
  ]) {
    assert.equal(
      carriesNoSource([...release, intruder]),
      false,
      `${intruder} must reach the code readers`,
    );
    assert.deepEqual(sourcePaths([...release, intruder]), [intruder]);
  }
});

test("`.changeset/` is matched at *.md only — the directory also holds code", () => {
  assert.equal(isManifestOnlyPath(".changeset/tidy-donkeys-shave.md"), true);

  // Six .mjs scripts live beside the changesets: the changelog formatter, the
  // PR-ref extractor, the release-plan checks. SonarCloud reads every one.
  for (const script of git("ls-files", ".changeset")
    .split("\n")
    .filter((p) => p && !p.endsWith(".md"))) {
    assert.equal(
      isManifestOnlyPath(script),
      false,
      `${script} is code, not a changeset`,
    );
  }
});

test("a path that merely contains the word is refused", () => {
  for (const path of [
    "packages/core/src/package.json.ts",
    "docs/CHANGELOG.md.bak",
    "packages/core/src/changelog.ts",
    "pnpm-lock.yaml.orig",
    "tools/pnpm-lock.yaml",
  ]) {
    assert.equal(isManifestOnlyPath(path), false, path);
  }
});

test("an empty diff answers false — nothing changed is not an answer", () => {
  // Every caller's safe default is to run the check. A `compare` that returned
  // no files is a failure to ask, not a diff without source in it.
  assert.equal(carriesNoSource([]), false);
  assert.equal(carriesNoSource(["", "  ", "\t"]), false);
});

test("blank lines around real paths do not change the answer", () => {
  assert.equal(carriesNoSource(["", "pnpm-lock.yaml", "  "]), true);
  assert.equal(
    carriesNoSource(["", "packages/core/src/a.ts", "pnpm-lock.yaml"]),
    false,
  );
});

test("the CLI answers by exit code and names what it found", () => {
  const out = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => (out.push(String(chunk)), true);

  try {
    assert.equal(main("packages/core/package.json\npnpm-lock.yaml\n"), 0);
    assert.match(out.at(-1), /no source in this diff/);

    assert.equal(main("pnpm-lock.yaml\npackages/core/src/a.ts\n"), 1);
    assert.match(out.at(-1), /source in this diff: packages\/core\/src\/a\.ts/);

    assert.equal(main("\n"), 1);
    assert.match(out.at(-1), /no changed paths/);
  } finally {
    process.stdout.write = write;
  }
});

test("the CLI truncates a long list rather than printing the tree", () => {
  const out = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => (out.push(String(chunk)), true);

  try {
    const many = Array.from(
      { length: 9 },
      (_, i) => `packages/core/src/f${String(i)}.ts`,
    );

    assert.equal(main(many.join("\n")), 1);
    assert.match(out.at(-1), /\(\+4 more\)/);
  } finally {
    process.stdout.write = write;
  }
});

test("every release commit on master is accepted", () => {
  const commits = releaseCommits();

  // Vacuity: a filter that matched nothing would satisfy the loop below.
  assert.ok(
    commits.length >= 10,
    `expected release commits in history, found ${String(commits.length)}`,
  );

  for (const line of commits) {
    const [sha] = line.split(" ");

    assert.equal(
      carriesNoSource(changedIn(sha)),
      true,
      `${line}\n  offenders: ${sourcePaths(changedIn(sha)).join(", ")}`,
    );
  }
});

test("every commit that touches source is refused", () => {
  const recent = git("log", "--format=%H %s", "-n", "200")
    .split("\n")
    .filter(Boolean);

  let checked = 0;

  for (const line of recent) {
    const [sha] = line.split(" ");
    const changed = changedIn(sha);

    if (!changed.some((p) => SOURCE_FILE.test(p))) continue;

    checked += 1;
    assert.equal(carriesNoSource(changed), false, line);
  }

  // Vacuity: `git log` failing would leave the loop with nothing to check.
  assert.ok(
    checked >= 50,
    `expected source-bearing commits in the last 200, found ${String(checked)}`,
  );
});

test("a dependency bump is accepted too, and that is the point", () => {
  // The predicate asks what the diff carries, not what produced it. A bump of
  // a devDependency changes `package.json` and the lockfile and no code, so the
  // three checks have nothing new to read there either — measured on master,
  // where dependency bumps land as their own commits.
  const bumps = git(
    "log",
    "--format=%H %s",
    "-n",
    "200",
    "--grep=^\\(ci\\|build\\|chore\\)(deps",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => [line, changedIn(line.split(" ")[0])])
    .filter(([, changed]) => changed.every(isManifestOnlyPath));

  assert.ok(
    bumps.length > 0,
    "expected manifest-only dependency bumps in the last 200 commits",
  );

  for (const [line, changed] of bumps) {
    assert.equal(carriesNoSource(changed), true, line);
  }
});
