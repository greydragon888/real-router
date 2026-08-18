/**
 * Probe 01: PERF — what the own-property read costs `buildPath` (#1798).
 *
 * Finding under test: `SegmentMatcher` decided "did the caller fill this slot?"
 * with reads that walk the prototype chain — `name in params` for a `?name`
 * declaration and a bare `params?.[slot.paramName]` for a `:name` slot. Both now
 * ask `Object.hasOwn`. That is one extra call per PATH SLOT on the hot path
 * (`buildPath` runs on every `<Link>` render across six adapters), so the cost
 * has to be a number rather than an assurance.
 *
 * ⚑ The probe measures ONE revision per process and prints absolute ns/op. It
 * cannot hold both variants itself: two implementations in one process share
 * inline caches and the second one measured pays a penalty that is an artifact of
 * the harness, not of the code. Run it against each revision instead:
 *
 *     git checkout <base>  && node --conditions=@real-router/internal-source \
 *       --import tsx benchmarks/audit-probes/…/probe-01-buildpath-own-property-cost.ts
 *     git checkout <fix>   && …same…
 *
 * alternating, at least 5 rounds each, and take medians. Run an A/A pass too (the
 * same revision twice in the same alternating pattern) — without a noise floor a
 * single-digit delta is not a result.
 *
 * ⚠ NOT battery-OK. This is a sub-microsecond timing probe: it needs a quiet
 * machine on mains power. On a throttling laptop the floor swallows the signal.
 *
 * Shapes, chosen so the cost can be attributed rather than averaged:
 *   - `static`   — no slots at all. The `slots.length === 0` fast path returns
 *                  before the loop, so this shape MUST be flat across revisions;
 *                  it is the control that says the harness is measuring the loop.
 *   - `1 slot` / `3 slots` / `5 slots` — the changed read runs once per slot, so
 *                  the delta should scale with slot count. A flat delta would mean
 *                  the cost is somewhere else.
 *   - `query x3` — the `?name` half (`name in params` → `Object.hasOwn`), which
 *                  runs per DECLARED query name.
 *
 * MEASURED 2026-08-18, Node 24.18.1, quiet machine on mains power, 5 alternating
 * rounds per variant, medians. A = the prototype-chain reads, B = `Object.hasOwn`;
 * the two source files differ in exactly those two reads and nothing else.
 *
 *     shape       A        B        delta      per slot
 *     static      88.3     86.7     -1.8%      —          ← control: loop never runs
 *     1 slot     153.5    164.9     +7.4%     +11.4 ns
 *     3 slots    293.7    317.5     +8.1%      +7.9 ns
 *     5 slots    413.4    452.8     +9.5%      +7.9 ns
 *     query x3   672.0    675.1     +0.5%      —          ← `hasOwn` ≈ `in`
 *
 * A/A floor, same protocol, B against itself: static 7.4%, 1 slot 8.1%,
 * 3 slots 5.4%, 5 slots 3.7%, query 2.6%.
 *
 * ⚑ Read the LINEARITY, not the percentage. Any single delta here sits close to
 * its own floor; what carries the result is that the cost is a constant ~7.9 ns
 * PER SLOT across 3 and 5 slots, while the static control (which returns before
 * the loop) is flat and the query direction is flat. That triangulates the cost
 * to the per-slot read and nowhere else — a conclusion no single-shape run could
 * support, which is why the earlier one-shape figure (+6.7% / ~6.5 ns) is
 * superseded by this one rather than merely refined.
 */
import { createRouter } from "@real-router/core";

import type { Params, SearchParams } from "@real-router/core/types";

const router = createRouter([
  { name: "static", path: "/about" },
  { name: "one", path: "/u/:a" },
  { name: "three", path: "/o/:a/p/:b/i/:c" },
  { name: "five", path: "/o/:a/p/:b/i/:c/x/:d/y/:e" },
  { name: "query", path: "/s?page&sort&filter" },
  { name: "home", path: "/home" },
]);

const THREE: Params = { a: "1", b: "2", c: "3" };
const FIVE: Params = { a: "1", b: "2", c: "3", d: "4", e: "5" };
const QUERY: SearchParams = { page: "2", sort: "name", filter: "x" };

const CASES: readonly (readonly [string, () => string])[] = [
  ["static  ", (): string => router.buildPath("static")],
  ["1 slot  ", (): string => router.buildPath("one", { a: "1" })],
  ["3 slots ", (): string => router.buildPath("three", THREE)],
  ["5 slots ", (): string => router.buildPath("five", FIVE)],
  ["query x3", (): string => router.buildPath("query", {}, QUERY)],
];

const WARMUP = 60_000;
const ITERATIONS = 300_000;

for (const [, fn] of CASES) {
  for (let i = 0; i < WARMUP; i++) {
    fn();
  }
}

const results: string[] = [];

for (const [label, fn] of CASES) {
  const started = process.hrtime.bigint();

  for (let i = 0; i < ITERATIONS; i++) {
    fn();
  }

  const nsPerOp = Number(process.hrtime.bigint() - started) / ITERATIONS;

  results.push(`${label} ${nsPerOp.toFixed(1)}`);
}

console.log(results.join(" | "));

router.dispose();
