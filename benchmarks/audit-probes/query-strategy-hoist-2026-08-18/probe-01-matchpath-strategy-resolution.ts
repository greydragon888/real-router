/**
 * Probe 01: PERF — what hoisting the query-strategy resolution buys `matchPath`
 * (#1796).
 *
 * Finding under test: `parseQuery` / `build` resolved the four query strategies
 * on EVERY call, from the caller's `queryParams` bag. `createMatcher` now calls
 * `makeOptions` once, at construction, and injects `parseQueryWith` / `buildWith`
 * already bound to the resolved struct — so `matchPath` on a URL that carries a
 * query no longer pays the resolution.
 *
 * ⚑ ONE revision per process, absolute ns/op. Two implementations in one process
 * share inline caches and the second one measured pays a penalty that belongs to
 * the harness. Alternate whole processes instead, and take medians:
 *
 *     git show <hoist>~1:packages/core/src/engine/createMatcher.ts > …   # A
 *     node --conditions=@real-router/internal-source --import tsx <this file>
 *     …restore, run again                                               # B
 *
 * at least 3 rounds each, plus an A/A pass (the same revision twice in the same
 * alternating pattern) — without a noise floor a single-digit delta is not a
 * result. The three files the hoist touched are `createMatcher.ts`,
 * `search-params/searchParams.ts` and `search-params/index.ts`.
 *
 * ⚠ NOT battery-OK — a sub-microsecond timing probe needs a quiet machine on
 * mains power.
 *
 * ⚠ THE TWO SHAPES DO THE SAME WORK. The header first claimed `defaults` (no
 * `queryParams` option) hit `makeOptions`' all-undefined fast path and returned
 * the cached singleton, making it the cheaper of the two. That is false, and the
 * refutation is in this repository: `OptionsNamespace` fills `queryParams` with
 * `DEFAULT_QUERY_PARAMS`, whose four fields are ALL DEFINED, so the fast path
 * never fires through a router — measured, `makeOptions(bag) === makeOptions()`
 * is false and two successive calls return different objects. (The same fact is
 * stated correctly in `search-params/encode.ts`, forty lines from where this
 * probe asserted its opposite.) So:
 *
 *   - `defaults` and `custom` differ in LABEL, not in path taken;
 *   - any split between their deltas is noise, and reporting one is reporting a
 *     coin flip. Three independent runs have now ordered them three ways.
 *
 * Keep both shapes anyway — a genuine future fast path would show up as the two
 * separating — but read them as ONE measurement of the same code, and do not
 * quote a per-shape number.
 *
 * MEASURED 2026-08-18, Node 24.18.1, alternating processes, medians. A =
 * per-call resolution, B = hoisted. The A side is reconstructed with
 * `git show 9e355856c~1:<file>` for the THREE files that commit touched
 * (`createMatcher.ts`, `search-params/searchParams.ts`,
 * `search-params/index.ts`) — reverting only the first leaves HEAD's delegation
 * frame in the A side and biases the result.
 *
 *     run                       defaults   custom
 *     first (5A/6B rounds)       -12.4%     -9.3%
 *     re-run (6 alternating)      -8.6%     -8.8%
 *
 * ⚑ Report the range, not a cell: the hoist buys roughly **9-12 % of `matchPath`
 * on a three-key query**, and the two shapes are indistinguishable within it.
 * A/A floor measured 0.5-1.7 % on a quiet machine and 2.6-8.7 % on a loaded one,
 * which is why the machine condition below is not a formality.
 *
 * ⚠ An independent check put the removed work at 40-64 ns — about 3-5 % of this
 * probe's own `matchPath` cost — against the 9-12 % recorded here. That check
 * held both revisions in ONE process, a protocol this repo treats as invalid, so
 * it is recorded as an open discrepancy rather than a correction. Settling it
 * needs a third variant on a quiet machine.
 *
 */
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const make = (queryParams?: Record<string, string>) =>
  getPluginApi(
    createRouter(
      [
        { name: "s", path: "/s?page&sort&filter" },
        { name: "home", path: "/home" },
      ],
      (queryParams ? { queryParams } : {}) as never,
    ),
  );

const URL_WITH_QUERY = "/s?page=2&sort=name&filter=x";

const CASES = [
  ["defaults", make()],
  ["custom  ", make({ arrayFormat: "brackets", booleanFormat: "empty-true" })],
] as const;

const WARMUP = 60_000;
const ITERATIONS = 300_000;

for (const [, api] of CASES) {
  for (let i = 0; i < WARMUP; i++) {
    api.matchPath(URL_WITH_QUERY);
  }
}

const results: string[] = [];

for (const [label, api] of CASES) {
  const started = process.hrtime.bigint();

  for (let i = 0; i < ITERATIONS; i++) {
    api.matchPath(URL_WITH_QUERY);
  }

  const nsPerOp = Number(process.hrtime.bigint() - started) / ITERATIONS;

  results.push(`${label} ${nsPerOp.toFixed(1)}`);
}

console.log(results.join(" | "));
