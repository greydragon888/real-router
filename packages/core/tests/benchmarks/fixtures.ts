/**
 * Shared fixtures + helpers for the core hot-path benchmark suite.
 *
 * The route generators below are HARVESTED worst-case inputs from the
 * (now-removed) per-package leaf benches of `path-matcher` / `route-tree`
 * (RFC §6.5 / §9.1). Each one reproduces the exact tree shape / URL that
 * forces a specific expensive dependency branch — splat backtracking,
 * wide-tree lookup, deep nesting, percent-decode, constraints — so the
 * macro-level core benches exercise every dangerous branch at the boundary
 * where it actually weighs (`matchPath` / `navigate` / `buildPath`), instead
 * of in leaf isolation that dilutes its real contribution.
 *
 * One matcher *form* (router options) per `.bench.ts` file — different route
 * data under the SAME options is realistic polymorphism, not megamorphism
 * (RFC §9.2). The process-per-file runner (`run.ts`) keeps forms isolated.
 */
import { argv } from "node:process";

import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";

import type { GuardFnFactory, PluginFactory, Route } from "../../src";

/**
 * True when `moduleFilename` (pass `__filename`) is the file Node launched
 * directly (`node <file>`), false when the module was imported by another.
 *
 * `packages/core` is `"type": "commonjs"`, so under tsx these files are CJS —
 * `__filename` is defined and `import.meta` is a compile error (TS1470). At
 * launch Node sets `process.argv[1]` to the entry file's path; comparing it to
 * each module's own `__filename` tells "launched directly" from "imported".
 *
 * Each `*.bench.ts` self-runs under `if (isMain(__filename))` so one body works
 * BOTH ways:
 *   - Local `pnpm bench` → `run.ts` spawns one process per file → `isMain` is
 *     true → the file runs itself (process-per-file isolation, §9.2, wall-clock).
 *   - CI → `codspeed.ts` *imports* every file's `run()` and awaits them in ONE
 *     process → `isMain` is false → no self-run; the entry drives them serially.
 *
 * The single-process CI path exists because CodSpeed injects its required V8
 * flags (`--allow-natives-syntax`, `--no-opt`, …) only into the process it
 * wraps directly, and those flags cannot ride through `NODE_OPTIONS`. A spawned
 * child (the old per-file model under CI) starts without them and dies in
 * `optimizeFunction` on the `%`-native syntax. See IMPLEMENTATION_NOTES.
 */
export function isMain(moduleFilename: string): boolean {
  return argv[1] === moduleFilename;
}

/**
 * Creates a CodSpeed-instrumented tinybench `Bench`. Under `codspeed run`
 * (CI) the plugin measures simulated CPU instructions; locally it degrades to
 * a normal wall-clock run (the numbers are not the gate — CodSpeed is).
 *
 * `throws: true` surfaces a throwing task as a process failure so the runner
 * exits non-zero (a broken bench must never pass silently).
 */
export function makeBench(name: string): Bench {
  return withCodSpeed(
    new Bench({ name, time: 100, warmup: false, throws: true }),
  );
}

/**
 * Anti-DCE sink. Value-returning hot ops (`matchPath` / `buildPath` /
 * `isActiveRoute` / …) are otherwise dead-code-eliminable on local runs; the
 * sink keeps the produced value observable. Under instrumentation the plugin
 * executes the task for real, and the consumed value stays live.
 */
export function keep(value: unknown): void {
  (globalThis as { __rrBenchSink?: unknown }).__rrBenchSink = value;
}

/** Guard factory that always allows, no state change (harvested: guards.bench). */
export const passthroughGuardFactory: GuardFnFactory = () => () => true;

/** Plugin observing `onTransitionSuccess` only — fan-out fixture (guards.bench). */
export const noopSuccessPlugin: PluginFactory = () => ({
  onTransitionSuccess: () => {},
});

/** `count` flat sibling routes `route0 … route{count-1}` (path-matcher stress.bench). */
export function wideRoutes(count: number): Route[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));
}

/** Single chain of `depth` nested routes `l0 → … → l{depth-1}` (stress.bench). */
export function deepRoutes(depth: number): Route[] {
  let current: Route = { name: `l${depth - 1}`, path: `/l${depth - 1}` };

  for (let i = depth - 2; i >= 0; i--) {
    current = { name: `l${i}`, path: `/l${i}`, children: [current] };
  }

  return [current];
}

/** URL matching the full `deepRoutes(depth)` chain: `/l0/l1/…/l{depth-1}`. */
export function deepPath(depth: number): string {
  let path = "";

  for (let i = 0; i < depth; i++) {
    path += `/l${i}`;
  }

  return path;
}

/** Dotted name of the deepest node in `deepRoutes(depth)`: `l0.l1.…`. */
export function deepName(depth: number): string {
  const parts: string[] = [];

  for (let i = 0; i < depth; i++) {
    parts.push(`l${i}`);
  }

  return parts.join(".");
}

/**
 * `staticChildren` static siblings + a trailing `*path` splat under `/base` —
 * forces a full static scan, then splat backtracking (path-matcher stress.bench).
 */
export function splatRoutes(staticChildren: number): Route[] {
  const children: Route[] = [];

  for (let i = 0; i < staticChildren; i++) {
    children.push({ name: `child${i}`, path: `/child${i}` });
  }

  children.push({ name: "catch", path: "/*path" });

  return [{ name: "base", path: "/base", children }];
}
