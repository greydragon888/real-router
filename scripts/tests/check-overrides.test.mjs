// check-overrides.test.mjs — the rules of `scripts/overrides.mjs` (#2646),
// each on a workspace built for it with a control beside it, and
// `scripts/check-overrides.mjs` on repositories of workspaces.
//
// Run:  node --test scripts/tests/check-overrides.test.mjs
//
// A fixture is written, not installed: a lockfile and the manifests of a
// virtual store. What its lockfile records under a key — a project's
// specifier, a package's peer range, a resolved version — is what pnpm
// 12.11.2 records, and the cells under "pnpm's matching" repeat probes of pnpm
// itself (IMPLEMENTATION_NOTES "Overrides are judged against the ranges their
// parents declare").

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { stringify } from "yaml";

import {
  ACCEPTED_FILE,
  OverridesRefusal,
  judgeWorkspace,
  readAccepted,
  settle,
} from "../overrides.mjs";

const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI = path.join(ROOT, "scripts", "check-overrides.mjs");

const gitEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const fixtures = [];
after(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

/**
 * @typedef {object} Tree
 * @property {[string, string][]} overrides in the order of the file
 * @property {Record<string, Record<string, unknown>>} [projects] directory →
 *   manifest; `.` is the root, `{ name: "fx-root" }` unless given
 * @property {Record<string, Record<string, Record<string, [string, string]>>>} [importers]
 *   directory → group → dependency → [specifier, version], as the lockfile
 *   records them
 * @property {Record<string, Record<string, any>>} [packages] `name@version` →
 *   its manifest's dependency fields, `resolved` and `resolvedOptional`
 *   (dependency → version, the snapshot's `dependencies` and
 *   `optionalDependencies`), `variants` (a peer suffix → that snapshot's
 *   resolved dependencies, a snapshot per suffix in place of `resolved`) and
 *   `recordedPeers` (the lockfile's peer ranges, the declared ones unless given)
 * @property {string} [lockfileVersion]
 * @property {string[]} [missing] packages the virtual store lacks
 * @property {boolean} [installed] false: no virtual store at all
 */

/**
 * A workspace at `base`, written as pnpm writes one.
 *
 * @param {string} base
 * @param {Tree} tree
 */
function writeWorkspace(base, tree) {
  const projects = { ".": { name: "fx-root" }, ...tree.projects };
  mkdirSync(base, { recursive: true });
  writeFileSync(
    path.join(base, "pnpm-workspace.yaml"),
    stringify({
      packages: Object.keys(projects).filter((dir) => dir !== "."),
      ...(tree.overrides.length > 0
        ? { overrides: new Map(tree.overrides) }
        : {}),
    }),
  );
  for (const [dir, manifest] of Object.entries(projects)) {
    mkdirSync(path.join(base, dir), { recursive: true });
    writeFileSync(
      path.join(base, dir, "package.json"),
      JSON.stringify({ version: "1.0.0", ...manifest }, null, 2),
    );
  }

  const packages = tree.packages ?? {};
  const importers = Object.fromEntries(
    Object.keys(projects).map((dir) => [
      dir,
      Object.fromEntries(
        Object.entries(tree.importers?.[dir] ?? {}).map(([group, deps]) => [
          group,
          Object.fromEntries(
            Object.entries(deps).map(([dep, [specifier, version]]) => [
              dep,
              { specifier, version },
            ]),
          ),
        ]),
      ),
    ]),
  );
  const lockfile = {
    lockfileVersion: tree.lockfileVersion ?? "9.0",
    importers,
    packages: Object.fromEntries(
      Object.entries(packages).map(([key, pkg]) => [
        key,
        {
          resolution: { integrity: "sha512-AAAA" },
          ...(pkg.peerDependencies === undefined
            ? {}
            : {
                peerDependencies: pkg.recordedPeers ?? pkg.peerDependencies,
              }),
        },
      ]),
    ),
    snapshots: Object.fromEntries(
      Object.entries(packages).flatMap(([key, pkg]) =>
        pkg.variants === undefined
          ? [
              [
                key,
                {
                  ...(pkg.resolved === undefined
                    ? {}
                    : { dependencies: pkg.resolved }),
                  ...(pkg.resolvedOptional === undefined
                    ? {}
                    : { optionalDependencies: pkg.resolvedOptional }),
                },
              ],
            ]
          : Object.entries(pkg.variants).map(([suffix, resolved]) => [
              `${key}${suffix}`,
              { dependencies: resolved },
            ]),
      ),
    ),
  };
  writeFileSync(
    path.join(base, "pnpm-lock.yaml"),
    stringify(lockfile, { aliasDuplicateObjects: false }),
  );

  if (tree.installed === false) return;
  const store = path.join(base, "node_modules", ".pnpm");
  mkdirSync(path.join(store, "node_modules"), { recursive: true });
  for (const [key, pkg] of Object.entries(packages)) {
    if (tree.missing?.includes(key)) continue;
    const at = key.indexOf("@", 1);
    const [name, version] = [key.slice(0, at), key.slice(at + 1)];
    const modules = path.join(store, key.replace("/", "+"), "node_modules");
    mkdirSync(path.join(modules, name), { recursive: true });
    const manifest = { name, version };
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      if (pkg[field] !== undefined) manifest[field] = pkg[field];
    }
    writeFileSync(
      path.join(modules, name, "package.json"),
      JSON.stringify(manifest),
    );
    // pnpm links each dependency beside the package.
    for (const [dep, resolved] of Object.entries({
      ...pkg.resolved,
      ...pkg.resolvedOptional,
      ...Object.values(pkg.variants ?? {})[0],
    })) {
      mkdirSync(path.dirname(path.join(modules, dep)), { recursive: true });
      symlinkSync(
        path.join("..", "..", `${dep}@${resolved}`.replace("/", "+")),
        path.join(modules, dep),
      );
    }
  }
}

/**
 * A repository whose root is the workspace of `tree`.
 *
 * @param {Tree} tree
 */
function repository(tree) {
  const root = mkdtempSync(path.join(tmpdir(), "overrides-"));
  fixtures.push(root);
  writeWorkspace(root, tree);
  return root;
}

/**
 * The rules each key breaks in the root workspace of `tree`.
 *
 * @param {Tree} tree
 * @returns {Map<string, string[]>} key → `rule: detail`
 */
function findingsOf(tree) {
  const { findings } = judgeWorkspace(repository(tree), ".");
  return new Map(
    [...findings].map(([override, found]) => [
      override.key,
      found.map(({ rule, detail }) => `${rule}: ${detail}`),
    ]),
  );
}

/**
 * @param {Map<string, string[]>} findings
 * @param {string} key
 */
const rulesOf = (findings, key) =>
  (findings.get(key) ?? []).map((line) => line.split(":")[0]);

/** @param {Tree} tree */
const refusalOf = (tree) =>
  assert.throws(() => judgeWorkspace(repository(tree), "."), OverridesRefusal);

/**
 * `a` and `b` depend on `c`, each with its own range, resolved to `version`.
 *
 * @param {Record<string, string>} ranges parent → declared range of c
 * @param {string} version
 */
function parentsOfC(ranges, version) {
  return {
    ...Object.fromEntries(
      Object.entries(ranges).map(([parent, range]) => [
        parent.includes("@", 1) ? parent : `${parent}@1.0.0`,
        { dependencies: { c: range }, resolved: { c: version } },
      ]),
    ),
    [`c@${version}`]: {},
  };
}

// ── dead ───────────────────────────────────────────────────────────────────

test("dead: a value that narrows no declared range", () => {
  const findings = findingsOf({
    overrides: [["c", ">=1.2.0"]],
    packages: parentsOfC({ a: "^1.2.0" }, "1.2.5"),
  });
  assert.deepEqual(findings.get("c"), [
    "dead: it narrows none of the 1 edge(s) it rewrites: a@1.0.0 declares ^1.2.0",
  ]);
});

test("dead, control: a value that narrows one declared range of two", () => {
  const findings = findingsOf({
    overrides: [["c", ">=1.2.1"]],
    packages: parentsOfC({ a: "^1.2.0", b: "^1.2.1" }, "1.2.5"),
  });
  assert.equal(findings.has("c"), false);
});

test("dead and edge: a key with a parent the tree lacks", () => {
  const findings = findingsOf({
    overrides: [["x>c", "1.2.5"]],
    packages: parentsOfC({ a: "^1.2.0" }, "1.2.5"),
  });
  assert.deepEqual(findings.get("x>c"), [
    "dead: it rewrites no edge",
    "edge: no x in the tree depends on c",
  ]);
});

test("dead and edge, control: a key with a parent the tree has", () => {
  const findings = findingsOf({
    overrides: [["a>c", "1.2.5"]],
    packages: parentsOfC({ a: "^1.2.0" }, "1.2.5"),
  });
  assert.equal(findings.has("a>c"), false);
});

test("dead: a `$name` value is not judged, and the result names it", () => {
  const tree = (value) => ({
    overrides: [["c", value]],
    projects: { ".": { name: "fx-root", devDependencies: { c: "1.2.5" } } },
    importers: { ".": { devDependencies: { c: ["1.2.5", "1.2.5"] } } },
    packages: parentsOfC({ a: "1.2.5" }, "1.2.5"),
  });

  const result = judgeWorkspace(repository(tree("$c")), ".");
  assert.deepEqual(
    result.unjudged.map((override) => [override.key, override.value]),
    [["c", "1.2.5"]],
  );
  assert.equal(result.findings.size, 0);

  // The control: the same value written as a literal is dead.
  assert.deepEqual(rulesOf(findingsOf(tree("1.2.5")), "c"), ["dead"]);
});

test("dead: an edge of `optionalDependencies` is judged as any other", () => {
  const findings = findingsOf({
    overrides: [["c", ">=1.2.0"]],
    packages: {
      "a@1.0.0": {
        optionalDependencies: { c: "^1.2.0" },
        resolvedOptional: { c: "1.2.5" },
      },
      "c@1.2.5": {},
    },
  });
  assert.deepEqual(findings.get("c"), [
    "dead: it narrows none of the 1 edge(s) it rewrites: a@1.0.0 declares ^1.2.0",
  ]);
});

test("dead: a dependency in both dependencies and optionalDependencies is judged by the optional one", () => {
  // npm's rule, which pnpm keeps: optionalDependencies override dependencies
  // of the same name.
  const findings = findingsOf({
    overrides: [["c", ">=1.2.0"]],
    packages: {
      "a@1.0.0": {
        dependencies: { c: "^1.0.0" },
        optionalDependencies: { c: "^1.2.0" },
        resolvedOptional: { c: "1.2.5" },
      },
      "c@1.2.5": {},
    },
  });
  assert.deepEqual(rulesOf(findings, "c"), ["dead"]);
});

/**
 * A scoped parent with two peer variants, each resolving `@s/c`.
 *
 * @param {string} key
 * @param {string} value
 * @param {[string, string]} versions what each variant resolves `@s/c` to
 */
const scoped = (key, value, versions) => ({
  overrides: /** @type {[string, string][]} */ ([[key, value]]),
  packages: {
    "@s/a@1.0.0": {
      dependencies: { "@s/c": "^1.2.0" },
      peerDependencies: { "@s/x": "*" },
      variants: {
        "(@s/x@1.0.0)": { "@s/c": versions[0], "@s/x": "1.0.0" },
        "(@s/x@2.0.0)": { "@s/c": versions[1], "@s/x": "2.0.0" },
      },
    },
    "@s/c@1.2.5": {},
    "@s/c@1.2.6": {},
    "@s/x@1.0.0": {},
    "@s/x@2.0.0": {},
  },
});

test("scoped names and the peer variants of a snapshot are read as pnpm writes them", () => {
  assert.deepEqual(
    findingsOf(scoped("@s/c", ">=1.2.0", ["1.2.5", "1.2.5"])).get("@s/c"),
    [
      "dead: it narrows none of the 1 edge(s) it rewrites: @s/a@1.0.0 declares ^1.2.0",
    ],
  );
  assert.deepEqual(
    findingsOf(scoped("@s/x>@s/c", "1.2.5", ["1.2.5", "1.2.5"])).get(
      "@s/x>@s/c",
    ),
    ["dead: it rewrites no edge", "edge: no @s/x in the tree depends on @s/c"],
  );
  // A scoped parent the tree has: the key rewrites its edge.
  assert.equal(
    findingsOf(scoped("@s/a>@s/c", "1.2.5", ["1.2.5", "1.2.5"])).has(
      "@s/a>@s/c",
    ),
    false,
  );
});

test("refused: a peer variant whose resolved version the key does not admit", () => {
  // The first variant breaks it: each one is compared, not the last.
  refusalOf(scoped("@s/c", "1.2.5", ["1.2.6", "1.2.5"]));
  assert.equal(
    findingsOf(scoped("@s/c", "1.2.5", ["1.2.5", "1.2.5"])).has("@s/c"),
    false,
  );
});

test("`$name` reads optionalDependencies over dependencies over devDependencies", () => {
  const { unjudged } = judgeWorkspace(
    repository({
      overrides: [["c", "$c"]],
      projects: {
        ".": {
          name: "fx-root",
          devDependencies: { c: "1.0.0" },
          dependencies: { c: "1.2.0" },
          optionalDependencies: { c: "1.2.5" },
        },
      },
      importers: { ".": { optionalDependencies: { c: ["1.2.5", "1.2.5"] } } },
      packages: { "c@1.2.5": {} },
    }),
    ".",
  );
  assert.deepEqual(
    unjudged.map((override) => override.value),
    ["1.2.5"],
  );

  const withoutOptional = judgeWorkspace(
    repository({
      overrides: [["c", "$c"]],
      projects: {
        ".": {
          name: "fx-root",
          devDependencies: { c: "1.0.0" },
          dependencies: { c: "1.2.5" },
        },
      },
      importers: { ".": { dependencies: { c: ["1.2.5", "1.2.5"] } } },
      packages: { "c@1.2.5": {} },
    }),
    ".",
  );
  assert.deepEqual(
    withoutOptional.unjudged.map((override) => override.value),
    ["1.2.5"],
  );
});

// ── below ──────────────────────────────────────────────────────────────────

test("below: the lowest version admitted, under the highest minimum a parent declares", () => {
  const findings = findingsOf({
    overrides: [["c", ">=1.0.0 <1.5.0"]],
    packages: parentsOfC({ a: "^1.0.0", b: "^1.2.0", d: "^1.1.0" }, "1.2.5"),
  });
  assert.deepEqual(findings.get("c"), [
    "below: the lowest version it admits, 1.0.0, is under ^1.2.0, the range b@1.0.0 declares for c",
  ]);
});

test("below, control: the lowest version admitted, at the highest minimum", () => {
  const findings = findingsOf({
    overrides: [["c", ">=1.2.0 <1.5.0"]],
    packages: parentsOfC({ a: "^1.0.0", b: "^1.2.0", d: "^1.1.0" }, "1.2.5"),
  });
  assert.equal(rulesOf(findings, "c").includes("below"), false);
});

test("below: a `$name` value is judged", () => {
  const findings = findingsOf({
    overrides: [["c", "$c"]],
    projects: { ".": { name: "fx-root", devDependencies: { c: "1.0.0" } } },
    importers: { ".": { devDependencies: { c: ["1.0.0", "1.0.0"] } } },
    packages: parentsOfC({ a: "^1.2.0", b: "^1.0.0" }, "1.0.0"),
  });
  assert.deepEqual(rulesOf(findings, "c"), ["below"]);
});

// ── edge ───────────────────────────────────────────────────────────────────

test("edge: a project's specifier, rewritten by a literal", () => {
  const tree = (manifest, key, recorded) => ({
    overrides: [["yaml@2", key]],
    projects: {
      ".": { name: "fx-root", devDependencies: { yaml: manifest } },
    },
    importers: { ".": { devDependencies: { yaml: [recorded, recorded] } } },
    packages: { [`yaml@${recorded}`]: {} },
  });

  assert.deepEqual(findingsOf(tree("2.9.0", "2.9.1", "2.9.1")).get("yaml@2"), [
    "edge: it rewrites the specifier of yaml in the root project: the manifest declares 2.9.0, the lockfile records 2.9.1",
  ]);
  // A literal equal to the manifest leaves the specifier, and the rule is
  // silent; a raised manifest under the same literal is rewritten again.
  assert.equal(
    rulesOf(findingsOf(tree("2.9.0", "2.9.0", "2.9.0")), "yaml@2").includes(
      "edge",
    ),
    false,
  );
  assert.equal(
    rulesOf(findingsOf(tree("2.9.2", "2.9.0", "2.9.0")), "yaml@2").includes(
      "edge",
    ),
    true,
  );
});

test("edge, control: `$name` keeps the root's specifier, and rewrites another project's", () => {
  const findings = findingsOf({
    overrides: [["yaml@2", "$yaml"]],
    projects: {
      ".": { name: "fx-root", devDependencies: { yaml: "2.9.1" } },
      p: { name: "p", devDependencies: { yaml: "^2.8.0" } },
    },
    importers: {
      ".": { devDependencies: { yaml: ["2.9.1", "2.9.1"] } },
      p: { devDependencies: { yaml: ["2.9.1", "2.9.1"] } },
    },
    packages: { "yaml@2.9.1": {} },
  });
  assert.deepEqual(findings.get("yaml@2"), [
    "edge: it rewrites the specifier of yaml in the project p: the manifest declares ^2.8.0, the lockfile records 2.9.1",
  ]);
});

test("edge: a peer pnpm installs for a project, under a key with and without a parent", () => {
  for (const key of ["c", "p>c"]) {
    const findings = findingsOf({
      overrides: [[key, "1.2.5"]],
      projects: { p: { name: "p", peerDependencies: { c: "^1.0.0" } } },
      importers: { p: { dependencies: { c: ["1.2.5", "1.2.5"] } } },
      packages: { "c@1.2.5": {} },
    });
    assert.deepEqual(findings.get(key), [
      "edge: it rewrites the specifier of c in the project p: the manifest declares ^1.0.0, the lockfile records 1.2.5",
    ]);
  }
});

test("edge, control: a peer pnpm installs for a project, under no key", () => {
  const findings = findingsOf({
    overrides: [["unrelated", "1.0.0"]],
    projects: { p: { name: "p", peerDependencies: { c: "^1.0.0" } } },
    importers: { p: { dependencies: { c: ["^1.0.0", "1.2.5"] } } },
    packages: { "c@1.2.5": {} },
  });
  assert.deepEqual([...findings.keys()], ["unrelated"]);
});

// ── pnpm's matching ────────────────────────────────────────────────────────

test("a key's range matches a declared range it intersects", () => {
  // `>=1.3.0` intersects `1` without lying inside it; `^2.0.0` does neither,
  // and its minimum, matched, would be the one "below" names.
  const findings = findingsOf({
    overrides: [["c@1", "1.2.5"]],
    packages: {
      "a@1.0.0": { dependencies: { c: ">=1.3.0" }, resolved: { c: "1.2.5" } },
      "b@1.0.0": { dependencies: { c: "^2.0.0" }, resolved: { c: "2.0.0" } },
      "c@1.2.5": {},
      "c@2.0.0": {},
    },
  });
  assert.deepEqual(findings.get("c@1"), [
    "below: the lowest version it admits, 1.2.5, is under >=1.3.0, the range a@1.0.0 declares for c",
  ]);
});

test("a key with a parent wins over one without, written first", () => {
  const findings = findingsOf({
    overrides: [
      ["c", "1.2.5"],
      ["a>c", "1.2.5"],
    ],
    packages: parentsOfC({ a: "^1.2.0" }, "1.2.5"),
  });
  assert.deepEqual(findings.get("c"), ["dead: it rewrites no edge"]);
  assert.equal(findings.has("a>c"), false);
});

test("a key with a range wins over one without, in either order", () => {
  for (const overrides of [
    [
      ["c", "1.0.0"],
      ["c@1", "1.2.5"],
    ],
    [
      ["c@1", "1.2.5"],
      ["c", "1.0.0"],
    ],
  ]) {
    const findings = findingsOf({
      overrides: /** @type {[string, string][]} */ (overrides),
      packages: parentsOfC({ a: "^1.0.0", b: "^1.1.0" }, "1.2.5"),
    });
    assert.deepEqual(findings.get("c"), ["dead: it rewrites no edge"]);
    assert.equal(findings.has("c@1"), false);
  }
});

test("of two keys whose ranges intersect, the first in the file wins", () => {
  for (const [first, second] of [
    ["c@1", "c@^1.0.0"],
    ["c@^1.0.0", "c@1"],
  ]) {
    const findings = findingsOf({
      overrides: [
        [first, "1.2.5"],
        [second, "1.2.6"],
      ],
      packages: parentsOfC({ a: "^1.0.0", b: "^1.1.0" }, "1.2.5"),
    });
    assert.deepEqual(findings.get(second), ["dead: it rewrites no edge"]);
    assert.equal(findings.has(first), false);
  }
});

test("a key's parent range holds the parent's version", () => {
  const tree = (key) => ({
    overrides: [[key, "1.2.5"]],
    packages: parentsOfC({ a: "^1.2.0" }, "1.2.5"),
  });
  assert.equal(findingsOf(tree("a@1>c")).has("a@1>c"), false);
  assert.deepEqual(findingsOf(tree("a@2>c")).get("a@2>c"), [
    "dead: it rewrites no edge",
    "edge: no a@2 in the tree depends on c",
  ]);
});

test("a key with a range does not match an empty declared specifier", () => {
  const tree = (key, specifier, version) => ({
    overrides: [[key, "1.2.5"]],
    projects: { p: { name: "p", dependencies: { c: "" } } },
    importers: { p: { dependencies: { c: [specifier, version] } } },
    packages: { [`c@${version}`]: {} },
  });
  assert.deepEqual(findingsOf(tree("c@1", "", "2.0.0")).get("c@1"), [
    "dead: it rewrites no edge",
  ]);
  // A key without a range rewrites it, and an empty specifier is not a range
  // the rules read.
  refusalOf(tree("c", "1.2.5", "1.2.5"));
});

// ── what the check refuses ─────────────────────────────────────────────────

test("refused: a lockfile that records what the check does not derive", () => {
  // A resolved version outside the key's value.
  refusalOf({
    overrides: [["c", "1.2.5"]],
    packages: parentsOfC({ a: "^1.2.0", b: "^1.0.0" }, "1.2.6"),
  });
  // A peer range the key would rewrite, recorded as declared.
  refusalOf({
    overrides: [["c", ">=1.2.5"]],
    packages: {
      "a@1.0.0": {
        peerDependencies: { c: "^1.0.0" },
        resolved: { c: "1.2.5" },
      },
      "b@1.0.0": { dependencies: { c: "^1.0.0" }, resolved: { c: "1.2.5" } },
      "c@1.2.5": {},
    },
  });
  // A project's specifier the key would rewrite, recorded as declared.
  refusalOf({
    overrides: [["c", "1.2.5"]],
    projects: { p: { name: "p", dependencies: { c: "^1.0.0" } } },
    importers: { p: { dependencies: { c: ["^1.0.0", "1.2.5"] } } },
    packages: { "c@1.2.5": {} },
  });
});

test("refused, control: the peer range recorded as the key rewrites it", () => {
  const findings = findingsOf({
    overrides: [["c", ">=1.2.5"]],
    packages: {
      "a@1.0.0": {
        peerDependencies: { c: "^1.0.0" },
        recordedPeers: { c: ">=1.2.5" },
        resolved: { c: "1.2.5" },
      },
      "b@1.0.0": { dependencies: { c: "^1.0.0" }, resolved: { c: "1.2.5" } },
      "c@1.2.5": {},
    },
  });
  assert.equal(findings.has("c"), false);
});

test("refused: a parent the virtual store lacks, of a dependency a key names", () => {
  const tree = (target) => ({
    overrides: [[target, "1.2.5"]],
    packages: parentsOfC({ a: "^1.2.0", b: "^1.0.0" }, "1.2.5"),
    missing: ["a@1.0.0"],
  });
  refusalOf(tree("c"));
  // The control: no key names c, and the edge is not read.
  assert.deepEqual([...findingsOf(tree("other")).keys()], ["other"]);
});

test("refused: an edge its installed parent does not declare", () => {
  refusalOf({
    overrides: [["c", "1.2.5"]],
    packages: {
      "a@1.0.0": { resolved: { c: "1.2.5" } },
      "b@1.0.0": { dependencies: { c: "^1.0.0" }, resolved: { c: "1.2.5" } },
      "c@1.2.5": {},
    },
  });
});

test("refused: a workspace with overrides and no virtual store; one without overrides is not read", () => {
  refusalOf({
    overrides: [["c", "1.2.5"]],
    packages: parentsOfC({ a: "^1.0.0" }, "1.2.5"),
    installed: false,
  });
  const result = judgeWorkspace(
    repository({ overrides: [], installed: false }),
    ".",
  );
  assert.equal(result.findings.size, 0);
});

test("refused: each key and value form the rules do not read", () => {
  const packages = parentsOfC({ a: "^1.0.0", b: "^1.1.0" }, "1.2.5");
  for (const [key, value] of [
    ["a>b>c", "1.2.5"],
    ["c@", "1.2.5"],
    ["c@latest", "1.2.5"],
    ["C D", "1.2.5"],
    ["c", "-"],
    ["c", "npm:d@1.2.5"],
    ["c", ""],
    ["c", "$missing"],
  ]) {
    assert.throws(
      () =>
        judgeWorkspace(
          repository({ overrides: [[key, value]], packages }),
          ".",
        ),
      OverridesRefusal,
      `${key}: ${value}`,
    );
  }
});

test("refused: a lockfile of another version", () => {
  const tree = (lockfileVersion) => ({
    overrides: [["c", "1.2.5"]],
    packages: parentsOfC({ a: "^1.2.0", b: "^1.0.0" }, "1.2.5"),
    lockfileVersion,
  });
  refusalOf(tree("6.0"));
  assert.equal(findingsOf(tree("9.0")).has("c"), false);
});

test("refused: a value that is not a string, and an anchor in the file", () => {
  for (const [text, message] of [
    [
      "overrides:\n  c: 1\n",
      /^the root workspace: c: a value that is not a string$/,
    ],
    [
      "overrides:\n  c: &v 1.2.5\n  d: *v\n",
      /^the root workspace: pnpm-workspace\.yaml: an anchor at overrides\.c$/,
    ],
  ]) {
    const root = repository({
      overrides: [["c", "1.2.5"]],
      packages: parentsOfC({ a: "^1.0.0", b: "^1.1.0" }, "1.2.5"),
    });
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), text);
    assert.throws(
      () => judgeWorkspace(root, "."),
      (error) =>
        error instanceof OverridesRefusal && message.test(error.message),
      text,
    );
  }
});

// ── accepted findings ──────────────────────────────────────────────────────

/**
 * A repository whose root holds `text` as its accepted list, or no list for
 * `null`.
 *
 * @param {string | null} text
 */
function acceptedIn(text) {
  const root = mkdtempSync(path.join(tmpdir(), "overrides-accepted-"));
  fixtures.push(root);
  if (text === null) return root;
  mkdirSync(path.join(root, "scripts"));
  writeFileSync(path.join(root, ACCEPTED_FILE), text);
  return root;
}

const entry = (fields = {}) => ({
  workspace: ".",
  key: "c",
  rule: "dead",
  why: "on purpose",
  ...fields,
});

test("accepted: the list a repository keeps, and none without one", () => {
  const root = acceptedIn(JSON.stringify([entry()]));
  assert.deepEqual(readAccepted(root), [entry()]);
  assert.deepEqual(readAccepted(acceptedIn(null)), []);
});

test("accepted, refused: each form the list does not read", () => {
  for (const value of [
    { not: "a list" },
    [entry({ extra: "field" })],
    [{ workspace: ".", key: "c", rule: "dead" }],
    [entry({ why: "" })],
    [entry({ key: 1 })],
    [entry({ rule: "narrow" })],
    [entry(), entry({ why: "again" })],
  ]) {
    assert.throws(
      () => readAccepted(acceptedIn(JSON.stringify(value))),
      OverridesRefusal,
      JSON.stringify(value),
    );
  }
});

test("accepted: an entry takes its rule of its key in its workspace, and nothing else", () => {
  const [c, d] = [{ key: "c" }, { key: "d" }];
  const results = [
    {
      dir: ".",
      label: "the root workspace",
      findings: new Map([
        [
          c,
          [
            { rule: "dead", detail: "it rewrites no edge" },
            { rule: "edge", detail: "no x in the tree depends on c" },
          ],
        ],
        [d, [{ rule: "dead", detail: "it rewrites no edge" }]],
      ]),
    },
  ];
  const accepted = [
    entry(),
    entry({ rule: "below" }),
    entry({ workspace: "sub", rule: "edge" }),
  ];
  const { open, kept, stale } = settle(results, accepted);
  assert.deepEqual(
    kept.map(({ entry: taken }) => taken),
    [accepted[0]],
  );
  assert.deepEqual(
    open.map(({ override, found }) => [
      override.key,
      found.map(({ rule }) => rule),
    ]),
    [
      ["c", ["edge"]],
      ["d", ["dead"]],
    ],
  );
  assert.deepEqual(stale, [accepted[1], accepted[2]]);
});

// ── the CLI ────────────────────────────────────────────────────────────────

/**
 * A git repository of workspaces: `dir` → tree, `.` the root; `untracked`
 * names those whose `pnpm-workspace.yaml` git does not track.
 *
 * @param {Record<string, Tree>} workspaces
 * @param {string[]} [untracked]
 */
function repositoryOf(workspaces, untracked = []) {
  const root = mkdtempSync(path.join(tmpdir(), "overrides-cli-"));
  fixtures.push(root);
  for (const [dir, tree] of Object.entries(workspaces)) {
    writeWorkspace(path.join(root, dir), tree);
  }
  execFileSync("git", ["init", "-q"], { cwd: root, env: gitEnv });
  const tracked = Object.keys(workspaces)
    .filter((dir) => !untracked.includes(dir))
    .map((dir) => path.posix.join(dir, "pnpm-workspace.yaml"));
  if (tracked.length > 0) {
    execFileSync("git", ["add", "--", ...tracked], { cwd: root, env: gitEnv });
  }
  return root;
}

/** @param {string} cwd */
function runCli(cwd) {
  const result = spawnSync(process.execPath, [CLI], {
    cwd,
    encoding: "utf8",
    env: gitEnv,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const clean = {
  overrides: [["c", "1.2.5"]],
  packages: parentsOfC({ a: "^1.2.0", b: "^1.0.0" }, "1.2.5"),
};
const dead = {
  overrides: [["c", ">=1.2.0"]],
  packages: parentsOfC({ a: "^1.2.0" }, "1.2.5"),
};

test("CLI: the workspaces of tracked pnpm-workspace.yaml files, from a subdirectory", () => {
  const root = repositoryOf(
    {
      ".": clean,
      sub: dead,
      // Untracked, and not installed: judged, it would be refused.
      stray: { ...dead, installed: false },
    },
    ["stray"],
  );
  const { status, output } = runCli(path.join(root, "sub"));
  assert.equal(status, 1, output);
  assert.match(output, /✖ overrides: 1 of 2 key\(s\) break a rule:/);
  assert.match(output, /^ {2}sub: c: >=1\.2\.0\n {4}dead — it narrows none/m);
  assert.doesNotMatch(output, /stray/);
});

test("CLI, control: no key breaks a rule; a `$name` key is named", () => {
  const root = repositoryOf({
    ".": {
      ...clean,
      overrides: [
        ["c", "1.2.5"],
        ["d", "$d"],
      ],
      projects: { ".": { name: "fx-root", devDependencies: { d: "1.0.0" } } },
      importers: { ".": { devDependencies: { d: ["1.0.0", "1.0.0"] } } },
      packages: { ...clean.packages, "d@1.0.0": {} },
    },
  });
  const { status, output } = runCli(root);
  assert.equal(status, 0, output);
  assert.match(
    output,
    /^ℹ the root workspace: d: \$d — not judged dead: it holds the root's own d \(1\.0\.0\)$/m,
  );
  assert.match(output, /^✅ overrides: 2 key\(s\) in 1 workspace\(s\)/m);
});

test("CLI: a refusal exits 2, and so does a repository that tracks no workspace", () => {
  const refused = runCli(repositoryOf({ ".": { ...clean, installed: false } }));
  assert.equal(refused.status, 2, refused.output);
  assert.match(
    refused.output,
    /✖ overrides: cannot judge — the root workspace: not installed: no node_modules\/\.pnpm/,
  );

  const none = runCli(repositoryOf({ ".": clean }, ["."]));
  assert.equal(none.status, 2, none.output);
  assert.match(none.output, /git tracks no pnpm-workspace\.yaml/);
});

test("CLI: an accepted finding passes; an accepted one no longer found fails", () => {
  const root = repositoryOf({ ".": clean, sub: dead });
  mkdirSync(path.join(root, "scripts"));
  writeFileSync(
    path.join(root, ACCEPTED_FILE),
    JSON.stringify([entry({ workspace: "sub", why: "kept on purpose" })]),
  );
  const passed = runCli(root);
  assert.equal(passed.status, 0, passed.output);
  assert.match(passed.output, /^ℹ sub: c: dead — accepted: kept on purpose$/m);
  assert.match(
    passed.output,
    /^✅ overrides: 2 key\(s\) in 2 workspace\(s\) break no rule; 1 finding\(s\) accepted$/m,
  );

  writeFileSync(
    path.join(root, ACCEPTED_FILE),
    JSON.stringify([
      entry({ workspace: "sub" }),
      entry({ workspace: ".", why: "no longer true" }),
    ]),
  );
  const failed = runCli(root);
  assert.equal(failed.status, 1, failed.output);
  assert.match(
    failed.output,
    /✖ overrides: 1 accepted finding\(s\) no longer found — remove them from scripts\/overrides-accepted\.json:\n {2}\.: c: dead$/m,
  );
});

test("CLI: what a reader refuses exits 2, named with its workspace and file", () => {
  const cases = [
    [
      (root) =>
        writeFileSync(
          path.join(root, "sub", "pnpm-lock.yaml"),
          "lockfileVersion: '9.0'\nimporters: {}\npackages:\n  a@1.0.0:\n    deprecated: no\u00a0break\n",
        ),
      /✖ overrides: cannot judge — sub: pnpm-lock\.yaml: an invisible character/,
    ],
    [
      (root) =>
        writeFileSync(
          path.join(
            root,
            "sub",
            "node_modules",
            ".pnpm",
            "a@1.0.0",
            "node_modules",
            "a",
            "package.json",
          ),
          "{",
        ),
      /✖ overrides: cannot judge — sub: node_modules\/\.pnpm\/a@1\.0\.0\/node_modules\/a\/package\.json: not JSON/,
    ],
    [
      (root) => writeFileSync(path.join(root, "sub", "package.json"), "{"),
      /✖ overrides: cannot judge — sub: package\.json: not JSON/,
    ],
    [
      (root) =>
        writeFileSync(
          path.join(root, "sub", "pnpm-workspace.yaml"),
          "overrides:\n  c: latest\n",
        ),
      /✖ overrides: cannot judge — sub: c: "latest" is not a semver range/,
    ],
    [
      (root) => {
        mkdirSync(path.join(root, "scripts"));
        writeFileSync(path.join(root, ACCEPTED_FILE), "[{");
      },
      /✖ overrides: cannot judge — scripts\/overrides-accepted\.json: not JSON/,
    ],
  ];
  for (const [breakIt, message] of cases) {
    const root = repositoryOf({ ".": clean, sub: dead });
    breakIt(root);
    const { status, output } = runCli(root);
    assert.equal(status, 2, output);
    assert.match(output, message);
  }
});
