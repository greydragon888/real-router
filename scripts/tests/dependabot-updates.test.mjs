// dependabot-updates.test.mjs — the updates a Dependabot PR carries, and the
// check that a rebuilt lockfile still holds them.
//
// Run:  node --test scripts/tests/dependabot-updates.test.mjs
//       (run by `scripts/scripts-tests.mjs`, in Repo Lints and in pre-push)
//
// `resolve-dependabot.sh` rebuilds a conflicted lockfile from the manifests. A
// bump inside a `~` range changes no manifest, so the rebuild alone drops it and
// the PR merges as a no-op. The cells below hold the two halves of the guard:
// reading the updates off Dependabot's commit metadata, and refusing a lockfile
// that lost one.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  atLeast,
  lockedVersions,
  missingUpdates,
  updatedDependencies,
} from "../dependabot-updates.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dependabot-updates.mjs",
);

// The shape of a real commit: Dependabot's on #2643, metadata block verbatim.
const PATCHES_COMMIT = `chore(deps): bump the patches group across 1 directory with 4 updates

Bumps the patches group with 4 updates in the / directory: [preact](https://github.com/preactjs/preact), [solid-js](https://github.com/solidjs/solid), [svelte](https://github.com/sveltejs/svelte/tree/HEAD/packages/svelte) and [vue](https://github.com/vuejs/core).

---
updated-dependencies:
- dependency-name: preact
  dependency-version: 10.29.8
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: patches
- dependency-name: solid-js
  dependency-version: 1.9.15
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: patches
- dependency-name: svelte
  dependency-version: 5.57.1
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: patches
- dependency-name: vue
  dependency-version: 3.5.43
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: patches
...

Signed-off-by: dependabot[bot] <support@github.com>
`;

const LOCKFILE = `lockfileVersion: '9.0'

importers:

  packages/vue:
    devDependencies:
      vue:
        specifier: ~3.5.39
        version: 3.5.43(typescript@6.0.3)

packages:

  '@vue/shared@3.5.43':
    resolution: {integrity: sha512-x}

  preact@10.29.8:
    resolution: {integrity: sha512-x}

  solid-js@1.9.14:
    resolution: {integrity: sha512-x}

snapshots:

  vue@3.5.43(typescript@6.0.3):
    dependencies:
      '@vue/shared': 3.5.43
`;

/** Runs the CLI as resolve-dependabot.sh does, with `input` on stdin. */
const run = (args, input) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", input });

test("reads every update off a real Dependabot commit, in order", () => {
  assert.deepEqual(updatedDependencies(PATCHES_COMMIT), [
    { name: "preact", version: "10.29.8" },
    { name: "solid-js", version: "1.9.15" },
    { name: "svelte", version: "5.57.1" },
    { name: "vue", version: "3.5.43" },
  ]);
});

test("drops the quotes Dependabot puts on a scoped name and on some versions", () => {
  const message = `---
updated-dependencies:
- dependency-name: "@vue/test-utils"
  dependency-version: '2.5.1'
  dependency-type: direct:development
...
`;

  assert.deepEqual(updatedDependencies(message), [
    { name: "@vue/test-utils", version: "2.5.1" },
  ]);
});

test("the newest commit's version wins, and a package is named once", () => {
  const newest = `---
updated-dependencies:
- dependency-name: vue
  dependency-version: 3.5.44
...
`;

  assert.deepEqual(updatedDependencies(`${newest}\n${PATCHES_COMMIT}`), [
    { name: "vue", version: "3.5.44" },
    { name: "preact", version: "10.29.8" },
    { name: "solid-js", version: "1.9.15" },
    { name: "svelte", version: "5.57.1" },
  ]);
});

test("ignores an entry without a version and anything outside the block", () => {
  const message = `- dependency-name: outside
  dependency-version: 9.9.9
---
updated-dependencies:
- dependency-name: actions/checkout
  dependency-type: direct:production
- dependency-name: kept
  dependency-version: 1.0.1
...
- dependency-name: after
  dependency-version: 2.0.0
`;

  assert.deepEqual(updatedDependencies(message), [
    { name: "kept", version: "1.0.1" },
  ]);
  assert.deepEqual(updatedDependencies("chore: a commit of a person\n"), []);
});

test("reads versions off package and snapshot keys, never off an importer", () => {
  const versions = lockedVersions(LOCKFILE);

  assert.deepEqual([...(versions.get("vue") ?? [])], ["3.5.43"]);
  assert.deepEqual([...(versions.get("@vue/shared") ?? [])], ["3.5.43"]);
  assert.deepEqual([...(versions.get("preact") ?? [])], ["10.29.8"]);
  assert.deepEqual([...(versions.get("solid-js") ?? [])], ["1.9.14"]);
  assert.equal(versions.has("packages/vue"), false);
  assert.equal(versions.has("typescript"), false);
});

test("compares versions by number, a prerelease below its release", () => {
  assert.equal(atLeast("3.5.43", "3.5.39"), true);
  assert.equal(atLeast("3.5.39", "3.5.39"), true);
  assert.equal(atLeast("3.5.4", "3.5.39"), false);
  assert.equal(atLeast("0.2202.1", "0.2202.0"), true);
  assert.equal(atLeast("1.0.0", "1.0.0-rc.1"), true);
  assert.equal(atLeast("1.0.0-rc.1", "1.0.0"), false);
  assert.equal(atLeast("1.0.0-rc.10", "1.0.0-rc.2"), true);
  assert.equal(atLeast("1.0", "1.0.0"), true);
});

test("a lockfile rebuilt from the manifests alone misses the patch, and says so", () => {
  const missing = missingUpdates(updatedDependencies(PATCHES_COMMIT), LOCKFILE);

  assert.deepEqual(
    missing.map(({ update, held }) => [update.name, held]),
    [
      ["solid-js", ["1.9.14"]],
      ["svelte", []],
    ],
  );
});

test("a version above the update's counts: master may have moved past it", () => {
  assert.deepEqual(
    missingUpdates([{ name: "vue", version: "3.5.40" }], LOCKFILE),
    [],
  );
});

test("the CLI prints the updates one per line", () => {
  const out = run([], PATCHES_COMMIT);

  assert.equal(out.status, 0, out.stderr);
  assert.equal(
    out.stdout,
    "preact@10.29.8\nsolid-js@1.9.15\nsvelte@5.57.1\nvue@3.5.43\n",
  );
});

test("the CLI says so when the input carries no metadata, and exits 0", () => {
  const out = run([], "chore: a commit of a person\n");

  assert.equal(out.status, 0);
  assert.equal(out.stdout, "");
  assert.match(out.stderr, /no updated-dependencies in the input/);
});

test("--check refuses a lockfile that lost an update and passes one that holds them all", () => {
  const dir = mkdtempSync(join(tmpdir(), "dependabot-updates-"));

  try {
    const lockfile = join(dir, "pnpm-lock.yaml");

    writeFileSync(lockfile, LOCKFILE);
    const refused = run(["--check", lockfile], PATCHES_COMMIT);

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /❌ solid-js@1\.9\.15 is not in .* \(it holds 1\.9\.14\)/);
    assert.match(refused.stderr, /❌ svelte@5\.57\.1 is not in .* \(it holds none\)/);

    writeFileSync(
      lockfile,
      `${LOCKFILE}\n  solid-js@1.9.15:\n    resolution: {}\n\n  svelte@5.57.1:\n    resolution: {}\n`,
    );
    const passed = run(["--check", lockfile], PATCHES_COMMIT);

    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /✓ 4 update\(s\) in .* at their version or above/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--check without a lockfile is a usage error", () => {
  const out = run(["--check"], PATCHES_COMMIT);

  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage: dependabot-updates\.mjs --check <lockfile>/);
});
