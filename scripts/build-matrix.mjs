#!/usr/bin/env node
// build-matrix.mjs — CI shard planner for the horizontal-sharding PoC (PoC-2).
//
// Reads turbo's affected-package set for the current PR, classifies each package
// by architectural layer, and emits either:
//   • mode=leaf    — small, non-core PR → keep the monolithic `pipeline` job, OR
//   • mode=sharded — full/near-full rebuild → a dynamic GHA matrix of parallel
//                    shards (base + adapters + plugin groups).
//
// It is the SINGLE source of architectural truth for the matrix: a new package
// is classified automatically from its deps/symlinks — zero `ci.yml` diff.
//
// Wired into `.github/workflows/ci.yml`: the `check` job runs
//   node scripts/build-matrix.mjs >> "$GITHUB_OUTPUT"
// and the leaf / base / sharded jobs branch on `mode` + consume `matrix` /
// `leaf_filter` (the explicit leaf execution filter — see buildPlan).
//
// Design doc: .claude/ci-acceleration-poc-ru.md (§3-A) + companion empirical
// measurements .claude/ci-acceleration-empirical-2026-06-20.md (A/B/C/D).
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO package sets, two turbo calls — do NOT collapse them (A5 + #1067):
//
// 1. ROUTING (leaf vs sharded) — `deriveAffected(runAffectedQuery())`, the NATIVE
//    `turbo query affected … --packages` TARGET set (changed + dependents). 🔴 A5:
//    this MUST NOT carry the dependency-closure, or `touchesCore` is always true
//    and `mode=leaf` never fires (proven on an rx-only commit, companion §D).
//    Explicit `--base origin/master --head HEAD` also fixes the bare-`--affected`
//    footgun (its auto-detected base is `main`, but this repo is on `master`).
//
// 2. MEMBERSHIP (which packages become shards) — `deriveMembership(runMembership
//    Query())`, the INPUT-AWARE `turbo run … --filter='...[origin/master]'
//    --dry=json` set. #1067: the query-affected TARGET set walks only the
//    DECLARED-dep graph, so a `shared/*` edit reaching consumers via symlink +
//    `../../shared/**` input-glob surfaces NONE of them → a shared PR sharded an
//    empty matrix and skipped its consumers while CI stayed green. The dry-run
//    graph is built from task INPUTS, so it DOES see them. The A5 closure caveat
//    is why this set feeds MEMBERSHIP only, never ROUTING.
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * Routing threshold: PRs touching ≤ K packages AND not touching the core layer
 * take the fast monolithic (leaf) path. K=10 calibrated on the affected-count
 * distribution of the last 30 master commits (companion doc §D): bimodal —
 * small leaf edits cluster at 1-2, core fanouts at 21-32, the [6..10] band holds
 * 2 PRs whose mis-shard cost is just the ~2m monolith. K=10 catches that band
 * cheaply.
 *
 * RE-MEASURED 2026-07-19 (cold per-task timings from the #1521 full-execution
 * run, cross-checked against two historical leaf runs): K is deliberately KEPT
 * at 10 — count is the wrong axis. Non-adapter groups are batched into single
 * shards, so same-group sets tie leaf-vs-sharded at ANY count; the entire
 * sharded win comes from the per-package ADAPTER shards. That is handled by the
 * `multiAdapter` composition trigger in `buildPlan` (≥2 affected adapters →
 * force sharded); K stays as the generic wide-set backstop.
 */
export const K = 10;

/**
 * The single package that forms the `base` layer: `@real-router/core` alone.
 * (Historically core + its workspace deps + tsdown-bundled deps — the package
 * *scope* of `--filter='@real-router/core...'`, verified live against turbo
 * 2.10.0 — but the fold-into-core waves below emptied that dep set.)
 *
 * Evolution: `type-guards` (the former sole `internal`-shard member) dissolved
 * into its consumer plugins (wave-2), emptying the internal shard (since removed
 * entirely from GROUP_NAMES / classify — no bare packages remain). `engine`
 * folded the former `path-matcher` + `search-params` + `route-tree` trio into
 * one bundled dep (engine-merge #1510), dropping the set from 8 to 6.
 * `event-emitter` then dissolved into core (`core/src/foundation/event-emitter`),
 * dropping it to 5; `@real-router/logger` likewise dissolved into core
 * (`core/src/foundation/logger` — a per-router `RouterLogger` instance replacing
 * the old process-global singleton, #724), dropping it to 4. `@real-router/types`
 * folded into core as the `/types` subpath (wave-2) — core no longer declares it
 * as a dep — dropping it to 3. `@real-router/fsm`'s frozen shell — published by
 * mistake, its live engine long since copied to `core/src/foundation/fsm` — was
 * deleted outright (wave-3; the published `0.6.1` stays on npm, deprecated),
 * dropping it to 2. Finally `engine` itself folded into core as `core/src/engine`
 * (engine-merge iteration 2) — core no longer declares it as a workspace dep —
 * dropping the set to 1: core alone.
 *
 * This member is EXCLUDED from the dynamic shards (`buildPlan` never puts the
 * `base` group in `include`) and delegated to the base-test job. base-test
 * imports THIS set to build its filter — running `test` on core explicitly. It
 * deliberately does NOT use `--filter='@real-router/core...'`: turbo's `pkg...`
 * runs the task only on the matched package, not its deps (`test` has no
 * `^test`). With core alone that would still run core (no gap today), but the
 * explicit-member form stays authoritative — if a bundled workspace dep is ever
 * re-added to base it would otherwise be tested nowhere → no lcov → SonarCloud
 * 0% on its changed lines (the #1030 failure mode, via the former event-emitter).
 * Keep this set authoritative: ci.yml's base-test filter is generated from it.
 */
export const CORE_LAYER = new Set(["@real-router/core"]);

/** The seven layer buckets, in a fixed order so the emitted matrix is stable. */
const GROUP_NAMES = [
  "base",
  "adapter",
  "url-plugin",
  "ssr-plugin",
  "adapter-shared",
  "leaf",
];

/**
 * Default filesystem-backed readers for `classify()`. Split out and injectable
 * so unit tests can drive `classify()` with synthetic packages (e.g. a
 * hypothetical `shared/dom-utils-extra` symlink) without touching disk — and
 * WITHOUT using turbo package-filters as a stand-in for "affected" (companion
 * doc §C footgun: `...pkg` / `pkg...` give the dependency tree, not affected).
 */
export const defaultReaders = {
  /** Direct `dependencies` keys of the package at `dir`. */
  readManifestDeps(dir) {
    const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return new Set(Object.keys(pj.dependencies ?? {}));
  },
  /** readlink targets of every symlink directly under `<dir>/src`. */
  readSymlinks(dir) {
    const src = join(dir, "src");
    if (!existsSync(src)) return [];
    return readdirSync(src, { withFileTypes: true })
      .filter((e) => e.isSymbolicLink())
      .map((e) => readlinkSync(join(src, e.name)));
  },
};

/**
 * A5-correct affected derivation. Takes the raw stdout of
 * `turbo query affected --base origin/master --head HEAD --packages` and returns
 * the package-level target set plus a name→directory map (turbo's own `path`,
 * so we never reconstruct `packages/<name>` — which breaks on
 * `@real-router/shared-sources` → `shared`).
 *
 * @param {string} queryJson raw JSON from `turbo query affected … --packages`
 * @returns {{ affected: string[], dirOf: Map<string,string> }}
 */
export function deriveAffected(queryJson) {
  const items = JSON.parse(queryJson).data.affectedPackages.items;
  const dirOf = new Map(items.map((p) => [p.name, p.path ?? ""]));
  // Keep only real `packages/*` workspaces: drops the `//` root, `shared`
  // (@real-router/shared-sources), and `benchmarks` (router-benchmarks).
  const affected = items
    .filter((p) => (p.path ?? "").startsWith("packages/"))
    .map((p) => p.name);
  return { affected, dirOf };
}

/**
 * INPUT-AWARE shard-membership derivation (#1067). Takes the raw stdout of
 * `turbo run test test:properties bundle --filter='...[origin/master]' --dry=json`
 * and returns the deduped `packages/*` target set plus a name→directory map from
 * turbo's own `tasks[].directory`.
 *
 * Unlike `turbo query affected --packages` (which walks the DECLARED-dep graph and
 * so cannot see a `shared/*` edit reaching its symlink consumers), the `dry=json`
 * run graph is built from task INPUTS — including the `../../shared/**` glob — so a
 * shared-source change surfaces every consumer here. This is the set the shards are
 * built from; `query affected` is kept only for the leaf/sharded routing decision.
 *
 * @param {string} dryRunJson raw JSON from `turbo run … --dry=json`
 * @returns {{ members: string[], dirOf: Map<string,string> }}
 */
export function deriveMembership(dryRunJson) {
  const { tasks } = JSON.parse(dryRunJson);
  const dirOf = new Map();
  const members = [];
  for (const t of tasks ?? []) {
    const dir = t.directory ?? "";
    // Same filter as deriveAffected: real `packages/*` only — drops the `//` root,
    // `shared` (@real-router/shared-sources) and `benchmarks` (router-benchmarks).
    // Multiple tasks per package (test/test:properties/bundle) → dedupe by name.
    if (!dir.startsWith("packages/") || dirOf.has(t.package)) continue;
    dirOf.set(t.package, dir);
    members.push(t.package);
  }
  return { members, dirOf };
}

/**
 * Classify one affected package into a layer bucket. Pure given its readers.
 * Throws on an unrecognised package so a new package with unusual deps fails the
 * compute-plan job loudly (R2.18 SPoF defence) rather than silently mis-sharding.
 *
 * @param {string} pkg package name
 * @param {Map<string,string>} dirOf name→directory (from turbo)
 * @param {typeof defaultReaders} readers injectable fs accessors
 * @returns {'base'|'adapter'|'url-plugin'|'ssr-plugin'|'adapter-shared'|'leaf'}
 */
export function classify(pkg, dirOf, readers = defaultReaders) {
  if (CORE_LAYER.has(pkg)) return "base";

  const dir = dirOf.get(pkg);
  if (!dir) throw new Error(`build-matrix: no turbo directory for ${pkg}`);

  const deps = readers.readManifestDeps(dir);
  const symlinks = readers.readSymlinks(dir);

  // Adapter — dual signature: deps {sources, route-utils} OR a shared/dom-utils
  // symlink. 5/6 adapters carry the symlink; angular is a git-tracked copy
  // (ng-packagr can't follow symlinks) and is caught by the deps signature.
  // `endsWith` (not `includes`) guards against future siblings like
  // `shared/dom-utils-extra` collision-matching here.
  if (
    (deps.has("@real-router/sources") &&
      deps.has("@real-router/route-utils")) ||
    symlinks.some((s) => s.endsWith("shared/dom-utils"))
  ) {
    return "adapter";
  }
  if (symlinks.some((s) => s.endsWith("shared/browser-env")))
    return "url-plugin";
  if (symlinks.some((s) => s.endsWith("shared/ssr"))) return "ssr-plugin";
  // route-utils/sources fan out to all 6 adapters — their own shard.
  if (pkg === "@real-router/sources" || pkg === "@real-router/route-utils")
    return "adapter-shared";
  // Everything else is a leaf — depends only on core (+ its /types, /validation,
  // /api subpaths). There is no separate "internal" shard for bare
  // (non-@real-router/) packages anymore: type-guards dissolved into its
  // consumers (wave-2), the shared browser-env / dom-utils were retired
  // (#1065/#1086), and `engine` folded into core/src/engine (engine-merge
  // iteration 2) — no bare packages remain. A future bare package would fall here.
  return "leaf";
}

/**
 * Bucket every affected package by layer.
 * @returns {Record<string,string[]>}
 */
export function groupAffected(affected, dirOf, readers = defaultReaders) {
  const groups = Object.fromEntries(GROUP_NAMES.map((n) => [n, []]));
  for (const pkg of affected) groups[classify(pkg, dirOf, readers)].push(pkg);
  return groups;
}

/**
 * Decide leaf vs sharded and, if sharded, emit the matrix include[].
 *
 * TWO package sets, because they answer two different questions (#1067):
 *   • `affected` — the ROUTING set from `turbo query affected --packages` (the
 *     declared-dep target set). It decides leaf vs sharded and must NOT carry the
 *     dependency-closure (A5), or `touchesCore` is always true and leaf never
 *     fires. It is blind to shared-source consumers (they depend on shared/* only
 *     via symlink + input-glob, not a declared dep) — that is fine for routing
 *     (touchesSharedSources still forces sharded), but WRONG for membership.
 *   • `membership` — the MEMBERSHIP set (default: `affected`). In production it is
 *     the INPUT-AWARE `...[origin/master]` set, which turbo derives from task
 *     inputs (`../../shared/**`) and therefore DOES include shared-source
 *     consumers. The shards are built from this set so a shared-source PR actually
 *     validates the adapters / url-plugins / ssr-plugins it invalidates. Deriving
 *     shards from `affected` instead is the #1067 bug: a shared PR shards nothing.
 *
 * Leaf: `affected.length <= K && !touchesCore && !touchesAdapterShared &&
 * !touchesSharedSources`. The matrix is still a VALID but empty `{ include: [] }`
 * — an empty string would make `fromJson('')` crash the workflow parse even when
 * the sharded job's `if:` is false (companion C1).
 *
 * Sharded: each adapter is its own shard (1 adapter = 1 shard, R2.10); the other
 * non-empty groups become one shard each. `base` is handled by a separate job,
 * so it is never in `include`. Empty groups are omitted → GHA spawns no runner.
 *
 * `leafFilter` (leaf only, else "") is the explicit `--filter=<pkg>` set the
 * pipeline-leaf job runs INSTEAD of `--filter='...[origin/master]'`. The git-ref
 * filter treats a root-file change (pnpm-lock.yaml, root tsconfig) as touching
 * EVERY workspace, so a Dependabot lockfile bump — routed here as a 1-package
 * leaf — would still execute the whole-repo graph; with Remote Cache off in the
 * Dependabot context (repo secrets are withheld) that graph runs COLD (~8m vs
 * ~2m). `query affected --packages` (this set) attributes the root lockfile to
 * the actually-affected package, so leaf EXECUTION scope matches the ROUTING
 * decision. Empty only on a root-config PR touching zero packages; pipeline-leaf
 * falls back to the git-ref filter there (which yields zero tasks on such a PR).
 *
 * @param {string[]} affected routing set (query-affected, packages/* only)
 * @param {Map<string,string>} dirOf name→directory (routing + membership merged)
 * @param {string[]} [membership] input-aware shard-membership set (default: affected)
 * @param {typeof defaultReaders} [readers] injectable fs accessors
 * @returns {{ mode: 'leaf'|'sharded', matrix: { include: Array<{name:string,filter:string}> }, leafFilter: string }}
 */
export function buildPlan(
  affected,
  dirOf,
  membership = affected,
  readers = defaultReaders,
) {
  // Routing signals are read from `affected` (the target set), NOT `membership`:
  // membership carries the dependency-closure, which would make touchesCore always
  // true (A5) and kill leaf-routing.
  const routing = groupAffected(affected, dirOf, readers);
  const touchesCore = routing.base.length > 0;
  // sources / route-utils are intermediate fanout amplifiers: a change to either
  // invalidates ALL 6 (heavy) adapters, so however few packages turbo reports
  // (sources alone fans out to 7, route-utils to 9 — both ≤ K), the monolithic
  // leaf path would serialize the entire adapter cohort (~15m observed on a
  // sources-only PR, #1017). Force the sharded path so the adapter shards run in
  // parallel — same rationale as touchesCore, just one layer down the graph.
  const touchesAdapterShared = routing["adapter-shared"].length > 0;
  // A shared-source edit is the SAME class of fanout amplifier, one layer below
  // sources/route-utils. The `@real-router/shared-sources` workspace (dir
  // `shared/`) owns shared/dom-utils, shared/browser-env and shared/ssr; an edit
  // to any of them fans out to every consumer that symlinks it — dom-utils → the
  // 6 (heavy) adapters, browser-env → the 3 url-plugins, ssr → the 2 ssr-plugins.
  // The declared-dep query set reports NONE of those consumers (the dep is a
  // symlink, not a package.json edge), only the `shared` workspace — which
  // `deriveAffected` drops from `affected` (path `shared/`, not `packages/*`). So
  // `shared-sources` survives only in `dirOf`; detect it there and force sharded,
  // same as touchesCore / touchesAdapterShared. The consumers themselves come from
  // `membership` (input-aware), not from here. Keys on the shared WORKSPACE, so a
  // direct multi-package edit that does NOT touch a shared source stays on the
  // count path (the K-boundary leaf set with two url-plugins is unaffected).
  const touchesSharedSources = dirOf.has("@real-router/shared-sources");
  // Composition trigger (K re-measure, 2026-07-19): adapters are the ONLY
  // per-package shards — every other group is batched into a single shard, so
  // for same-group sets the sharded path equals the leaf path at ANY count
  // (measured tie). The win exists exactly when ≥2 adapters are affected:
  // cold per-task CI timings give sharded +29s at 2 adapters, +59s at 3,
  // +143s at 6 (the historical 371s leaf run), while a SINGLE adapter is ~6s
  // better on leaf. A pure count (K) cannot see this — "2 adapters + 1 plugin"
  // is N=3 and would stay leaf. Same force pattern as touchesAdapterShared.
  const multiAdapter = routing.adapter.length >= 2;

  if (
    affected.length <= K &&
    !touchesCore &&
    !touchesAdapterShared &&
    !touchesSharedSources &&
    !multiAdapter
  ) {
    // Explicit per-package filter from the routing set, so leaf EXECUTION scope
    // equals the ROUTING decision (see the leafFilter note above): a root
    // pnpm-lock.yaml bump stays scoped to its real package instead of the
    // whole-repo balloon `--filter='...[origin/master]'` produces.
    return {
      mode: "leaf",
      matrix: { include: [] },
      leafFilter: affected.map((p) => `--filter=${p}`).join(" "),
    };
  }

  // Shards come from `membership` (input-aware) — this is where shared-source
  // consumers surface; `affected` (declared-dep) would omit them (#1067).
  const groups = groupAffected(membership, dirOf, readers);
  const include = [];
  for (const a of groups.adapter) {
    include.push({
      name: a.replace(/^@real-router\//, ""),
      filter: `--filter=${a}`,
    });
  }
  for (const name of GROUP_NAMES) {
    if (name === "base" || name === "adapter") continue;
    const pkgs = groups[name];
    if (pkgs.length === 0) continue;
    include.push({ name, filter: pkgs.map((p) => `--filter=${p}`).join(" ") });
  }

  // Guard (#1067): a shared-source PR MUST surface its consumers as shards. An
  // empty `include` here means `membership` lost them (the pre-fix bug: shards
  // derived from the declared-dep `affected`, which omits shared consumers) — CI
  // would then pass green with the base-* jobs only and ZERO consumer validation.
  // Fail loudly instead. (A pure core-layer change legitimately yields empty
  // shards — the base-* jobs cover it — so this only guards the shared trigger,
  // where empty is always a misdetection.)
  if (touchesSharedSources && include.length === 0) {
    throw new Error(
      "build-matrix: shared-source PR routed to sharded but produced no consumer " +
        "shards — the membership set surfaced no shardable package (misdetection); " +
        "refusing to emit a green-but-empty shard plan (#1067)",
    );
  }

  // leafFilter is leaf-only; sharded scopes each shard via its matrix filter.
  return { mode: "sharded", matrix: { include }, leafFilter: "" };
}

/** Run the native turbo affected query (separated so tests never spawn turbo). */
export function runAffectedQuery() {
  return execSync(
    "pnpm exec turbo query affected --base origin/master --head HEAD --packages",
    {
      encoding: "utf8",
    },
  );
}

/**
 * Run the input-aware membership query (#1067) — mirrors the shard command
 * (`test test:properties bundle`) so membership = exactly the packages a shard
 * would run for the affected filter. `--dry=json` plans without executing.
 * `maxBuffer` is raised: on a full/shared rebuild the graph JSON (per-task input
 * maps for ~32 packages × 3 tasks) exceeds the 1 MiB execSync default.
 */
export function runMembershipQuery() {
  return execSync(
    "pnpm exec turbo run test test:properties bundle " +
      "--filter='...[origin/master]' --filter='!./examples/**' " +
      "--filter='!./benchmarks' --dry=json",
    {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
}

/** Entry point: query (routing) + dry-run (membership) → plan → GITHUB_OUTPUT. */
export function main() {
  const { affected, dirOf } = deriveAffected(runAffectedQuery());
  const { members, dirOf: memberDirOf } =
    deriveMembership(runMembershipQuery());
  // Merge dirs so classify() can resolve every membership package; query's dirOf
  // is applied last so the `shared-sources` workspace entry (which membership
  // drops but touchesSharedSources keys on) is retained.
  const mergedDirOf = new Map([...memberDirOf, ...dirOf]);
  const { mode, matrix, leafFilter } = buildPlan(
    affected,
    mergedDirOf,
    members,
  );
  process.stdout.write(`mode=${mode}\n`);
  process.stdout.write(`matrix=${JSON.stringify(matrix)}\n`);
  process.stdout.write(`leaf_filter=${leafFilter}\n`);
}

// Run main() only when invoked directly (`node scripts/build-matrix.mjs`),
// not when imported by the test file.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
