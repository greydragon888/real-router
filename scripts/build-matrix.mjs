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
// Wiring into `.github/workflows/ci.yml` is intentionally NOT done here — this
// is the standalone classifier component (PoC-2 step 2b). The compute-plan job
// would call:  node scripts/build-matrix.mjs >> "$GITHUB_OUTPUT"
//
// Design doc: .claude/ci-acceleration-poc-ru.md (§3-A) + companion empirical
// measurements .claude/ci-acceleration-empirical-2026-06-20.md (A/B/C/D).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 A5 (the load-bearing correctness invariant — do NOT regress):
// affected packages come from the NATIVE `turbo query affected … --packages`
// API, which returns the TARGET set (changed + dependents). We must NOT parse
// `turbo run … --dry=json` and read `tasks[].package`: that is the EXECUTION
// graph including each target's build *dependencies*, so `core` is pulled into
// EVERY affected set as a dependency → `touchesCore` is always true → `mode=leaf`
// never fires → the whole leaf-routing branch is dead. Proven empirically on an
// rx-only commit (companion doc §D). The native API gives a clean target set,
// and explicit `--base origin/master --head HEAD` also fixes the bare-`--affected`
// footgun (its auto-detected base is `main`, but this repo is on `master`).
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
 * cheaply. Re-calibrate on a feature-phase PR sample (current window is
 * release/foundation-skewed).
 */
export const K = 10;

/**
 * The 8 packages that `--filter='@real-router/core...'` expands to (core + its
 * workspace deps + tsdown-bundled deps). Mirrors that filter exactly, verified
 * live against turbo 2.10.0. NOTE: `type-guards` is NOT here — core does not
 * depend on it; it rides the `internal` shard. Topologically Layer 0/1/2 = 9
 * packages, but `base` = 8 (the difference is exactly `type-guards`).
 */
export const CORE_LAYER = new Set([
  "@real-router/core",
  "@real-router/types",
  "@real-router/fsm",
  "@real-router/logger",
  "path-matcher",
  "route-tree",
  "event-emitter",
  "search-params",
]);

/** The seven layer buckets, in a fixed order so the emitted matrix is stable. */
const GROUP_NAMES = [
  "base",
  "adapter",
  "url-plugin",
  "ssr-plugin",
  "adapter-shared",
  "leaf",
  "internal",
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
 * so we never reconstruct `packages/<name>` — which breaks on `@real-router/types`
 * → `packages/core-types` and `@real-router/shared-sources` → `shared`).
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
 * Classify one affected package into a layer bucket. Pure given its readers.
 * Throws on an unrecognised package so a new package with unusual deps fails the
 * compute-plan job loudly (R2.18 SPoF defence) rather than silently mis-sharding.
 *
 * @param {string} pkg package name
 * @param {Map<string,string>} dirOf name→directory (from turbo)
 * @param {typeof defaultReaders} readers injectable fs accessors
 * @returns {'base'|'adapter'|'url-plugin'|'ssr-plugin'|'adapter-shared'|'leaf'|'internal'}
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
  // browser-env / dom-utils / type-guards — the unscoped internal packages.
  if (!pkg.startsWith("@real-router/")) return "internal";
  // depends only on core/types/logger.
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
 * Leaf: `affected.length <= K && !touchesCore`. The matrix is still a VALID but
 * empty `{ include: [] }` — an empty string would make `fromJson('')` crash the
 * workflow parse even when the sharded job's `if:` is false (companion C1).
 *
 * Sharded: each adapter is its own shard (1 adapter = 1 shard, R2.10); the other
 * non-empty groups become one shard each. `base` is handled by a separate job,
 * so it is never in `include`. Empty groups are omitted → GHA spawns no runner.
 *
 * @returns {{ mode: 'leaf'|'sharded', matrix: { include: Array<{name:string,filter:string}> } }}
 */
export function buildPlan(affected, dirOf, readers = defaultReaders) {
  const groups = groupAffected(affected, dirOf, readers);
  const touchesCore = groups.base.length > 0;

  if (affected.length <= K && !touchesCore) {
    return { mode: "leaf", matrix: { include: [] } };
  }

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
  return { mode: "sharded", matrix: { include } };
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

/** Entry point: query → plan → emit GITHUB_OUTPUT lines. */
export function main() {
  const { affected, dirOf } = deriveAffected(runAffectedQuery());
  const { mode, matrix } = buildPlan(affected, dirOf);
  process.stdout.write(`mode=${mode}\n`);
  process.stdout.write(`matrix=${JSON.stringify(matrix)}\n`);
}

// Run main() only when invoked directly (`node scripts/build-matrix.mjs`),
// not when imported by the test file.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
