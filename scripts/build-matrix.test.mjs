// build-matrix.test.mjs — unit tests for the CI shard planner (PoC-2 step 2b).
//
// Run:  node --test scripts/build-matrix.test.mjs
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace, and these run with zero install/turbo dependency. Two levels per
// the design doc acceptance E1 (.claude/ci-acceleration-poc-ru.md §4 PoC-2):
//   • Level 1 — affected derivation (A5): the rx-only regression that proves the
//     dependency-closure is NOT pulled in (without it, leaf-routing is dead).
//   • Level 2 — classify(): a live sweep over the real packages/* tree must
//     reproduce the companion §C buckets — now 3/6/3/2/2/8/0 = 24 after the
//     foundation dissolutions (event-emitter + logger in wave-1, type-guards +
//     the @real-router/types fold into core in wave-2); §C's original master
//     figure was 6/6/3/2/2/8/1 = 28 — plus synthetic
//     edge cases driven through injected readers (NOT turbo package-filters,
//     which give the dep tree, not affected — companion §C footgun).
// Plus routing (buildPlan): K boundary, touchesCore override, fanout shapes.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPlan,
  classify,
  CORE_LAYER,
  deriveAffected,
  deriveMembership,
  K,
} from "./build-matrix.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Real name→absolute-dir map, scanned from packages/* on disk (no turbo spawn).
 * Absolute dirs make classify()'s fs reads independent of the test's cwd.
 * This is the snapshot the live-sweep test asserts against.
 */
function loadRealDirOf() {
  const pkgsDir = join(repoRoot, "packages");
  const dirOf = new Map();
  for (const entry of readdirSync(pkgsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pjPath = join(pkgsDir, entry.name, "package.json");
    if (!existsSync(pjPath)) continue;
    const { name } = JSON.parse(readFileSync(pjPath, "utf8"));
    dirOf.set(name, join(pkgsDir, entry.name));
  }
  return dirOf;
}

const realDirOf = loadRealDirOf();
const allPackages = [...realDirOf.keys()];

// Named expectations (companion §C). Kept explicit so a re-classification is
// caught by name, not just by an aggregate count drifting.
const ADAPTERS = ["react", "preact", "solid", "svelte", "vue", "angular"].map(
  (a) => `@real-router/${a}`,
);
const URL_PLUGINS = ["browser-plugin", "hash-plugin", "navigation-plugin"].map(
  (p) => `@real-router/${p}`,
);
const SSR_PLUGINS = ["rsc-server-plugin", "ssr-data-plugin"].map(
  (p) => `@real-router/${p}`,
);
const ADAPTER_SHARED = ["@real-router/route-utils", "@real-router/sources"];
const LEAVES = [
  "rx",
  "memory-plugin",
  "lifecycle-plugin",
  "preload-plugin",
  "validation-plugin",
  "search-schema-plugin",
  "logger-plugin",
  "persistent-params-plugin",
].map((p) => `@real-router/${p}`);
const INTERNAL = [];

// ─── Level 1 — affected derivation (A5, the load-bearing invariant) ──────────

test("L1: rx-only PR derives affected=[rx] WITHOUT the dependency-closure (A5)", () => {
  // Native `turbo query affected … --packages` shape: target set only.
  const queryJson = JSON.stringify({
    data: {
      affectedPackages: {
        items: [
          { name: "//", path: "", reason: { __typename: "GlobalDepsChanged" } },
          {
            name: "@real-router/rx",
            path: "packages/rx",
            reason: { __typename: "FileChanged" },
          },
          {
            name: "router-benchmarks",
            path: "benchmarks",
            reason: { __typename: "DependencyChanged" },
          },
        ],
      },
    },
  });
  const { affected } = deriveAffected(queryJson);
  // The whole point of A5: core/types/fsm are NOT here. If they were,
  // touchesCore would always be true and mode=leaf would never fire.
  assert.deepEqual(affected, ["@real-router/rx"]);
  for (const core of CORE_LAYER)
    assert.ok(!affected.includes(core), `closure leaked ${core}`);
});

test("L1: '//' root, shared workspace and benchmarks are filtered out", () => {
  const queryJson = JSON.stringify({
    data: {
      affectedPackages: {
        items: [
          { name: "//", path: "" },
          { name: "@real-router/shared-sources", path: "shared" },
          { name: "router-benchmarks", path: "benchmarks" },
          { name: "@real-router/core", path: "packages/core" },
        ],
      },
    },
  });
  const { affected, dirOf } = deriveAffected(queryJson);

  assert.deepEqual(affected, ["@real-router/core"]);
  // `shared` is dropped from `affected` but RETAINED in dirOf — that is where
  // buildPlan reads the shared-source fanout amplifier (touchesSharedSources).
  assert.ok(dirOf.has("@real-router/shared-sources"));
});

test("L1: dirOf uses turbo's path verbatim (shared-sources quirk, not reconstructed)", () => {
  // core-types was the packages/* name≠dir quirk until wave-2 folded it into
  // core; `@real-router/shared-sources` → `shared` is the surviving example.
  const queryJson = JSON.stringify({
    data: {
      affectedPackages: {
        items: [{ name: "@real-router/shared-sources", path: "shared" }],
      },
    },
  });
  const { affected, dirOf } = deriveAffected(queryJson);
  // shared-sources is a fanout amplifier — recorded in dirOf (verbatim path) but
  // not itself a shardable affected package, so `affected` stays empty.
  assert.deepEqual(affected, []);
  // packages/<name> reconstruction would have produced packages/shared-sources → ENOENT.
  assert.equal(dirOf.get("@real-router/shared-sources"), "shared");
});

test("L1: docs/empty affected derives to []", () => {
  const queryJson = JSON.stringify({
    data: { affectedPackages: { items: [{ name: "//", path: "" }] } },
  });
  assert.deepEqual(deriveAffected(queryJson).affected, []);
});

test("L1: deriveMembership dedups tasks[].package, keeps packages/* via turbo directory (#1067)", () => {
  // Shape of `turbo run test test:properties bundle …[origin/master] --dry=json`:
  // one task entry per (package, task), each with turbo's own `directory`.
  const dryJson = JSON.stringify({
    packages: ["@real-router/shared-sources"], // the changed seed — irrelevant to membership
    tasks: [
      { package: "@real-router/react", directory: "packages/react" },
      { package: "@real-router/react", directory: "packages/react" }, // dup (bundle+test)
      { package: "engine", directory: "packages/engine" },
      { package: "@real-router/shared-sources", directory: "shared" }, // dropped (not packages/*)
      { package: "router-benchmarks", directory: "benchmarks" }, // dropped
      { package: "//", directory: "" }, // dropped
    ],
  });
  const { members, dirOf } = deriveMembership(dryJson);
  assert.deepEqual(
    [...members].sort(),
    ["@real-router/react", "engine"],
    "membership = deduped packages/* target set",
  );
  assert.ok(!dirOf.has("@real-router/shared-sources"));
});

// ─── Level 2 — classify() live sweep over the real packages/* tree ───────────

test("L2: classify() buckets all real packages/* exactly 3/6/3/2/2/8/0 = 24", () => {
  const counts = {};
  for (const pkg of allPackages) {
    const bucket = classify(pkg, realDirOf);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  assert.equal(allPackages.length, 24, "expected 24 packages/* workspaces");
  assert.deepEqual(counts, {
    base: 3,
    adapter: 6,
    "url-plugin": 3,
    "ssr-plugin": 2,
    "adapter-shared": 2,
    leaf: 8,
  });
});

test("L2: each named package lands in its expected bucket", () => {
  const expect = (pkg, bucket) =>
    assert.equal(classify(pkg, realDirOf), bucket, pkg);
  for (const p of CORE_LAYER) expect(p, "base");
  for (const p of ADAPTERS) expect(p, "adapter"); // angular has no symlink → deps signature
  for (const p of URL_PLUGINS) expect(p, "url-plugin");
  for (const p of SSR_PLUGINS) expect(p, "ssr-plugin");
  for (const p of ADAPTER_SHARED) expect(p, "adapter-shared");
  for (const p of LEAVES) expect(p, "leaf");
  for (const p of INTERNAL) expect(p, "internal");
});

// ─── Level 2 — classify() edge cases via injected readers (no disk/turbo) ────

const noDeps = () => new Set();
const withSymlink = (target) => ({
  readManifestDeps: noDeps,
  readSymlinks: () => [target],
});
const oneDir = new Map([["@real-router/x", "packages/x"]]);

test("L2 edge: exact shared/* symlink matches its consumer class (positive control)", () => {
  assert.equal(
    classify(
      "@real-router/x",
      oneDir,
      withSymlink("../../../shared/dom-utils"),
    ),
    "adapter",
  );
  assert.equal(
    classify(
      "@real-router/x",
      oneDir,
      withSymlink("../../../shared/browser-env"),
    ),
    "url-plugin",
  );
  assert.equal(
    classify("@real-router/x", oneDir, withSymlink("../../../shared/ssr")),
    "ssr-plugin",
  );
});

test("L2 edge: shared/<x>-suffix siblings do NOT collide (endsWith, not includes)", () => {
  // If `includes` were used these would mis-bucket as adapter/url-plugin/ssr-plugin.
  assert.equal(
    classify(
      "@real-router/x",
      oneDir,
      withSymlink("../../../shared/dom-utils-extra"),
    ),
    "leaf",
  );
  assert.equal(
    classify(
      "@real-router/x",
      oneDir,
      withSymlink("../../../shared/browser-env-mobile"),
    ),
    "leaf",
  );
  assert.equal(
    classify(
      "@real-router/x",
      oneDir,
      withSymlink("../../../shared/ssr-helpers"),
    ),
    "leaf",
  );
});

test("L2 edge: adapter recognised by deps signature alone (angular-style, no symlink)", () => {
  const readers = {
    readManifestDeps: () =>
      new Set([
        "@real-router/core",
        "@real-router/route-utils",
        "@real-router/sources",
      ]),
    readSymlinks: () => [],
  };
  assert.equal(classify("@real-router/x", oneDir, readers), "adapter");
});

test("L2 edge: missing turbo directory throws loudly (R2.18 SPoF, not silent skip)", () => {
  assert.throws(
    () => classify("@real-router/ghost", new Map()),
    /no turbo directory for @real-router\/ghost/,
  );
});

// ─── Routing — buildPlan() ───────────────────────────────────────────────────

test("routing: small non-core PR → leaf with a VALID empty matrix (C1)", () => {
  const plan = buildPlan(["@real-router/rx"], realDirOf);
  assert.deepEqual(plan, {
    mode: "leaf",
    matrix: { include: [] },
    leafFilter: "--filter=@real-router/rx",
  });
});

test("routing: empty affected → leaf with empty matrix", () => {
  assert.deepEqual(buildPlan([], realDirOf), {
    mode: "leaf",
    matrix: { include: [] },
    leafFilter: "",
  });
});

test("routing: K boundary — K non-core → leaf, K+1 → sharded", () => {
  assert.equal(K, 10);
  const tenNonCore = [...LEAVES, ...URL_PLUGINS.slice(0, 2)]; // 8 + 2 = 10
  const elevenNonCore = [...LEAVES, ...URL_PLUGINS]; // 8 + 3 = 11
  assert.equal(buildPlan(tenNonCore, realDirOf).mode, "leaf");
  assert.equal(buildPlan(elevenNonCore, realDirOf).mode, "sharded");
});

test("routing: touchesCore overrides leaf even for a tiny affected set", () => {
  // length 1 ≤ K, but base.length > 0 → must shard.
  assert.equal(buildPlan(["@real-router/core"], realDirOf).mode, "sharded");
});

test("routing: route-utils fanout (intermediate amplifier) → sharded despite ≤ K", () => {
  // Empirically measured (isolated route-utils source edit, turbo 2.10.0):
  // affected = route-utils + sources + 6 adapters = 8, no core layer.
  // 8 ≤ K(10), so the COUNT alone would route to leaf — but route-utils/sources
  // are intermediate fanout amplifiers (every change invalidates all 6 HEAVY
  // adapters), so the monolith would serialize the whole adapter cohort (~15m
  // observed on a sources-only PR, #1017). `touchesAdapterShared` forces the
  // sharded path regardless of count, restoring the design doc's §3 intent
  // (route-utils → sharded with the adapter shards) that the K=5→K=10
  // recalibration had inverted.
  const routeUtilsFanout = [
    ...ADAPTERS,
    "@real-router/route-utils",
    "@real-router/sources",
  ];
  assert.equal(routeUtilsFanout.length, 8);
  assert.equal(buildPlan(routeUtilsFanout, realDirOf).mode, "sharded");
});

test("routing: sources-only fanout (7 affected, ≤ K) → sharded (#1017 regression)", () => {
  // The #1017 regression: a sources-only PR fans out to the 6 adapters
  // (sources + 6 = 7 ≤ K, no core), was routed to leaf → the monolith serialized
  // all 6 adapters (~15m). touchesAdapterShared now forces sharded so the adapter
  // shards run in parallel.
  const sourcesFanout = [...ADAPTERS, "@real-router/sources"];
  assert.equal(sourcesFanout.length, 7);
  const { mode, matrix } = buildPlan(sourcesFanout, realDirOf);
  assert.equal(mode, "sharded");
  const names = matrix.include.map((i) => i.name);
  for (const a of ["react", "preact", "solid", "svelte", "vue", "angular"])
    assert.ok(names.includes(a), a);
  assert.ok(names.includes("adapter-shared"));
  assert.equal(matrix.include.length, 7); // 6 adapters + adapter-shared
});

test("routing: touchesAdapterShared overrides leaf even for a tiny affected set", () => {
  // Symmetric with the touchesCore override: sources/route-utils alone is length
  // 1 ≤ K with no core layer, but is a fanout amplifier → must shard.
  assert.equal(buildPlan(["@real-router/sources"], realDirOf).mode, "sharded");
  assert.equal(
    buildPlan(["@real-router/route-utils"], realDirOf).mode,
    "sharded",
  );
});

test("routing: shared-source fanout — routing shards via touchesSharedSources, membership (input-aware) supplies the consumer shards (#1067)", () => {
  // GROUND TRUTH (turbo 2.10): `turbo query affected --packages` maps a shared/*
  // edit to @real-router/shared-sources ONLY — the symlink + `../../shared/**`
  // input-glob dep is invisible to the declared-dep graph, so the ROUTING set has
  // zero consumers. shared-sources survives in dirOf, so touchesSharedSources
  // forces sharded (run 28393785008: a shared/dom-utils PR would otherwise take
  // the ~20m leaf monolith). But the shard CONTENTS come from the input-aware
  // `...[origin/master]` MEMBERSHIP set — feeding the empty routing set to the
  // shards was the #1067 bug (run 28489824878 shipped browser-plugin +
  // navigation-plugin unbuilt).
  const dirOf = new Map([
    ...realDirOf,
    ["@real-router/shared-sources", "shared"],
  ]);
  const routing = []; // packages/* from query-affected on a pure shared edit

  // shared/dom-utils → input-aware membership = the 6 adapters.
  const domUtils = buildPlan(routing, dirOf, [...ADAPTERS]);
  assert.equal(domUtils.mode, "sharded");
  const domUtilsNames = domUtils.matrix.include.map((i) => i.name);
  for (const a of ["react", "preact", "solid", "svelte", "vue", "angular"])
    assert.ok(domUtilsNames.includes(a), a);

  // shared/browser-env → the 3 url-plugins.
  const browserEnv = buildPlan(routing, dirOf, [...URL_PLUGINS]);
  assert.equal(browserEnv.mode, "sharded");
  assert.ok(
    browserEnv.matrix.include.map((i) => i.name).includes("url-plugin"),
  );

  // shared/ssr → the 2 ssr-plugins.
  const ssr = buildPlan(routing, dirOf, [...SSR_PLUGINS]);
  assert.equal(ssr.mode, "sharded");
  assert.ok(ssr.matrix.include.map((i) => i.name).includes("ssr-plugin"));
});

test("routing: sharded with an empty membership set throws — empty matrix is a misdetection, not green (#1067)", () => {
  const dirOf = new Map([
    ...realDirOf,
    ["@real-router/shared-sources", "shared"],
  ]);
  // touchesSharedSources forces sharded, but membership is empty → the pre-fix
  // code emitted mode=sharded + {"include":[]} and passed CI green with ZERO
  // shards (base-* jobs only, consumers unvalidated). The guard must fail loudly.
  assert.throws(
    () => buildPlan([], dirOf, []),
    /empty|no.*shard|misdetection/i,
  );
});

test("routing: a multi-package edit WITHOUT a shared source stays leaf (≤ K)", () => {
  // Distinguishes a shared-source fanout from an unrelated multi-package edit:
  // two url-plugins edited directly (no shared/* touched) → shared-sources NOT
  // in dirOf → the count path → leaf, exactly as the K-boundary set. Guards the
  // touchesSharedSources override from over-firing on direct edits.
  assert.ok(!realDirOf.has("@real-router/shared-sources"));
  const twoUrlPlugins = [...LEAVES, ...URL_PLUGINS.slice(0, 2)]; // 10
  assert.equal(buildPlan(twoUrlPlugins, realDirOf).mode, "leaf");
});

test("routing: sharded matrix — adapter shards + non-empty groups only, empties omitted", () => {
  // Synthetic >K non-core set exercising the sharded matrix shape: 6 adapters +
  // 2 adapter-shared + 3 url-plugins = 11 > K. ssr-plugin/leaf/internal stay
  // empty and must NOT spawn runners; base is a separate job, never a shard.
  const affected = [...ADAPTERS, ...ADAPTER_SHARED, ...URL_PLUGINS]; // 11
  const { mode, matrix } = buildPlan(affected, realDirOf);
  assert.equal(mode, "sharded");
  const names = matrix.include.map((i) => i.name);
  for (const a of ["react", "preact", "solid", "svelte", "vue", "angular"])
    assert.ok(names.includes(a), a);
  assert.ok(names.includes("adapter-shared"));
  assert.ok(names.includes("url-plugin"));
  for (const empty of ["ssr-plugin", "leaf", "internal", "base"]) {
    assert.ok(
      !names.includes(empty),
      `empty/base group ${empty} leaked into matrix`,
    );
  }
  assert.equal(matrix.include.length, 8); // 6 adapters + adapter-shared + url-plugin
  // Adapter shard carries a single-package filter.
  assert.deepEqual(
    matrix.include.find((i) => i.name === "react"),
    { name: "react", filter: "--filter=@real-router/react" },
  );
});

test("routing: full rebuild (all 24) → base excluded, 10 shards", () => {
  const { mode, matrix } = buildPlan(allPackages, realDirOf);
  assert.equal(mode, "sharded");
  const names = matrix.include.map((i) => i.name);
  assert.ok(!names.includes("base"), "base is a separate job, never a shard");
  // 6 adapters + url-plugin + ssr-plugin + adapter-shared + leaf.
  // (The `internal` group is empty since wave-2 dissolved type-guards — its
  // sole member — so it no longer produces a shard; see the L2 buckets test.)
  for (const g of ["url-plugin", "ssr-plugin", "adapter-shared", "leaf"]) {
    assert.ok(names.includes(g), g);
  }
  assert.ok(!names.includes("internal"), "internal group is empty → no shard");
  assert.equal(matrix.include.length, 10);
});

// ─── leafFilter — leaf EXECUTION scope == ROUTING decision (root-lockfile fix) ─

test("leafFilter: single-package leaf → one explicit --filter", () => {
  // The regression shape: a Dependabot bump edits packages/preact/package.json +
  // the ROOT pnpm-lock.yaml. `query affected --packages` attributes it to preact
  // alone, so pipeline-leaf runs `--filter=@real-router/preact` — NOT the
  // whole-repo graph that `--filter='...[origin/master]'` produces the moment a
  // root file changes (turbo treats the root lockfile as touching every
  // workspace). With Remote Cache off in the Dependabot context that whole graph
  // ran cold (~8m); scoping leaf execution to the routing set keeps it ~2m.
  const { mode, leafFilter } = buildPlan(["@real-router/preact"], realDirOf);
  assert.equal(mode, "leaf");
  assert.equal(leafFilter, "--filter=@real-router/preact");
});

test("leafFilter: multi-package leaf → space-joined tokens (ci.yml word-splits)", () => {
  const affected = ["@real-router/rx", "@real-router/memory-plugin"];
  const { mode, leafFilter } = buildPlan(affected, realDirOf);
  assert.equal(mode, "leaf");
  assert.equal(
    leafFilter,
    "--filter=@real-router/rx --filter=@real-router/memory-plugin",
  );
});

test("leafFilter: empty on a zero-package leaf (ci.yml falls back to git-ref)", () => {
  // Root-config PR touching no packages → leaf with no explicit filter; the
  // workflow substitutes `--filter='...[origin/master]'`, which yields zero
  // tasks on such a PR (git diff = config files, not packages).
  assert.equal(buildPlan([], realDirOf).leafFilter, "");
});

test("leafFilter: sharded emits empty leafFilter (shards use their matrix filter)", () => {
  assert.equal(buildPlan(allPackages, realDirOf).leafFilter, "");
});

test("leafFilter: END-TO-END #1112 — root-lockfile query JSON → narrow leaf filter", () => {
  // The exact turbo shape a Dependabot lockfile bump produces: the root `//`
  // workspace surfaces (GlobalDepsChanged = the root pnpm-lock.yaml moved) next
  // to the one real package and its examples. deriveAffected drops `//` + the
  // examples, buildPlan routes leaf, and leafFilter stays scoped to preact — NOT
  // the whole-repo balloon `--filter='...[origin/master]'` would emit here.
  const queryJson = JSON.stringify({
    data: {
      affectedPackages: {
        items: [
          { name: "//", path: "", reason: { __typename: "GlobalDepsChanged" } },
          {
            name: "@real-router/preact",
            path: "packages/preact",
            reason: { __typename: "FileChanged" },
          },
          {
            name: "preact-basic-example",
            path: "examples/web/preact/basic",
            reason: { __typename: "DependencyChanged" },
          },
        ],
      },
    },
  });
  const { affected, dirOf } = deriveAffected(queryJson);
  assert.deepEqual(affected, ["@real-router/preact"]);
  const { mode, leafFilter } = buildPlan(affected, dirOf);
  assert.equal(mode, "leaf");
  assert.equal(leafFilter, "--filter=@real-router/preact");
});

test("leafFilter: carries the routing set verbatim — NO dependency-closure", () => {
  // rx depends on core (+ its deps), but leaf runs `--filter=@real-router/rx`
  // ONLY — turbo pulls the deps' ^bundle in via the task graph; they are NOT in
  // the execution filter. This is precisely what `--filter='...[ref]'` failed to
  // keep narrow on a root-file change (it added every workspace). Round-trips
  // back to the affected set exactly.
  const affected = ["@real-router/rx"];
  const { leafFilter } = buildPlan(affected, realDirOf);
  assert.deepEqual(
    leafFilter.split(" ").map((t) => t.replace(/^--filter=/, "")),
    affected,
  );
  for (const core of CORE_LAYER)
    assert.ok(!leafFilter.includes(core), `closure leaked ${core}`);
});

test("leafFilter: invariant — leaf ⇒ tokens == affected, sharded ⇒ empty", () => {
  const decode = (f) => f.split(" ").map((t) => t.replace(/^--filter=/, ""));
  for (const affected of [
    ["@real-router/rx"],
    ["@real-router/preact"],
    [...LEAVES], // 8 ≤ K, all non-core → leaf
  ]) {
    const { mode, leafFilter } = buildPlan(affected, realDirOf);
    assert.equal(mode, "leaf", affected.join(","));
    assert.deepEqual(decode(leafFilter), affected);
  }
  for (const affected of [
    allPackages, // > K
    ["@real-router/core"], // touchesCore
    ["@real-router/sources"], // touchesAdapterShared
  ]) {
    const { mode, leafFilter } = buildPlan(affected, realDirOf);
    assert.equal(mode, "sharded", affected.join(","));
    assert.equal(leafFilter, "");
  }
});

test("leafFilter: K-boundary leaf (10 packages) emits all 10 tokens in order", () => {
  const tenNonCore = [...LEAVES, ...URL_PLUGINS.slice(0, 2)]; // 8 + 2 = 10 (== K)
  const { mode, leafFilter } = buildPlan(tenNonCore, realDirOf);
  assert.equal(mode, "leaf");
  const tokens = leafFilter.split(" ");
  assert.equal(tokens.length, 10);
  assert.deepEqual(
    tokens.map((t) => t.replace(/^--filter=/, "")),
    tenNonCore,
  );
});
