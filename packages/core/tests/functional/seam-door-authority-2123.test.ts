import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core/types";

/**
 * Which public doors RUN the interceptable `forwardState` chain, and which of
 * them the plugin-seam bench prices (#2123).
 *
 * The drift this refuses is a door that starts running the chain while the bench
 * keeps measuring the ones it always did — the bench would then report "what a
 * plugin costs" about a surface that grew under it.
 *
 * ⚑ **The set is DERIVED by counting, not read.** An interceptor is registered
 * and every public method is called; the ones whose call increments the counter
 * are the doors. Reading call sites cannot answer this: `router.isActiveRoute`
 * reaches `forwardState` in the source and runs the chain ZERO times, because
 * `RoutesNamespace` calls the namespace primitive rather than the seam — "a
 * predicate on the render path must not run the plugin interceptor chain once per
 * `<Link>`".
 *
 * ⚠ **`SEAM` is not the door set, and a guard written against it reds at once.**
 * `SEAM` is `{ start, forwardState }` — seam NAMES. `buildPath` is not among them;
 * it RUNS `forwardState`. The two sets answer different questions.
 *
 * ⚑ **Why only one door is benchmarked, measured rather than assumed.** The chain
 * costs about the SAME number of nanoseconds wherever it runs — with both plugins
 * installed, +958 ns at `buildPath`, +1026 at `canNavigateTo`, +1362 at `navigate`
 * (per-call medians, each door read against its own `none` arm measured first and
 * last; drift floors −5.0 %, +1.6 %, −6.1 %). What separates the doors is CALL
 * FREQUENCY, and it separates them by orders of magnitude: `buildHref` sits
 * unmemoised in the React `<Link>` render body, so `buildPath` runs once per link
 * per render — 0.60 % of a 16 ms frame at a hundred links — while `canNavigateTo`
 * has no call site outside core at all and `navigate` runs about once per user
 * interaction. A second benchmarked door would repeat a number the first already
 * gives.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const BENCH = path.join(REPO_ROOT, "benchmarks/plugin-seam/bench.mts");

const ROUTES = [
  { name: "home", path: "/" },
  { name: "list", path: "/list?page&q" },
];

/**
 * Every chain-running door, and why the bench does or does not price it.
 *
 * ⚠ `tracked: false` is a decision with a measured reason, not an oversight. A
 * table listing only the tracked door would read as complete.
 */
const CHAIN_DOORS: Record<string, { tracked: boolean; why: string }> = {
  buildPath: {
    tracked: true,
    why: "once per <Link> per RENDER — unmemoised in the adapter's render body",
  },
  canNavigateTo: {
    tracked: false,
    why: "no call site outside core, in any adapter or example source",
  },
  navigate: {
    tracked: false,
    why: "once per user interaction; and persistent-params' onTransitionSuccess enters the arm, so it would not price the chain alone",
  },
  navigateToDefault: {
    tracked: false,
    why: "once per user interaction, the same arc as navigate",
  },
  start: { tracked: false, why: "once per router" },
};

/** How to call each public method with arguments it accepts. */
const CALLS: Record<string, (router: Router) => unknown> = {
  areStatesEqual: (router) =>
    router.areStatesEqual(router.getState(), router.getState()),
  buildPath: (router) => router.buildPath("list", {}, { q: "x" }),
  canNavigateTo: (router) => router.canNavigateTo("list", {}, { q: "x" }),
  getPreviousState: (router) => router.getPreviousState(),
  getState: (router) => router.getState(),
  isActive: (router) => router.isActive(),
  isActiveRoute: (router) => router.isActiveRoute("list", {}, { q: "x" }),
  isLeaveApproved: (router) => router.isLeaveApproved(),
  navigate: (router) => router.navigate("list", {}, { q: "x" }),
  navigateToDefault: (router) => router.navigateToDefault(),
  navigateToNotFound: (router) => router.navigateToNotFound("/nope"),
  shouldUpdateNode: (router) => router.shouldUpdateNode("list"),
  subscribe: (router) => router.subscribe(() => undefined),
  subscribeLeave: (router) => router.subscribeLeave(() => undefined),
};

/**
 * Methods with no safe probe, each with the reason. ⚠ This table is asserted
 * EXHAUSTIVE against the enumerated surface below, so a method added to the
 * router is never silently unclassified — it is in `CALLS` or here, or the
 * completeness cell reds.
 */
const UNPROBEABLE: Record<string, string> = {
  dispose: "tears the router down; a probe would measure a corpse",
  stop: "lifecycle, not a door that resolves a route",
  usePlugin: "registration, not a door that resolves a route",
  start:
    "probed on its own below — it is the one door whose call is the fixture",
};

/** The public surface, enumerated from a router rather than listed. */
function publicSurface(): string[] {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  const members = router as unknown as Record<string, unknown>;

  return Object.keys(router)
    .filter((key) => typeof members[key] === "function")
    .toSorted((left, right) => left.localeCompare(right));
}

/** Run one probe on a fresh router and report how many times the chain ran. */
async function chainRuns(call: (router: Router) => unknown): Promise<number> {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  let runs = 0;

  getPluginApi(router).addInterceptor(
    "forwardState",
    (next, name, params, search) => {
      runs += 1;

      return next(name, params, search);
    },
  );
  await router.start("/");
  runs = 0;
  try {
    await call(router);
  } catch {
    // A door may refuse the probe's arguments — `navigateToDefault` answers
    // SAME_STATES from the default route. The chain has already run by then, and
    // the count is what this asks about.
  }

  return runs;
}

/** `start`'s own run, which the fixture above zeroes away for every other door. */
async function startChainRuns(): Promise<number> {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  let runs = 0;

  getPluginApi(router).addInterceptor(
    "forwardState",
    (next, name, params, search) => {
      runs += 1;

      return next(name, params, search);
    },
  );
  await router.start("/");

  return runs;
}

/** The doors the bench prices, taken from its arm labels. */
function benchedDoors(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/`seam\/(?<door>[A-Za-z]+)-\$\{arm\}`/gu)].map(
        (match) => match.groups?.door ?? "",
      ),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
}

describe("every door that runs the seam chain is accounted for (#2123)", () => {
  it("classifies every public method — none is silently unexamined", () => {
    const classified = new Set([
      ...Object.keys(CALLS),
      ...Object.keys(UNPROBEABLE),
    ]);
    const unclassified = publicSurface().filter(
      (method) => !classified.has(method),
    );

    expect(unclassified).toStrictEqual([]);
  });

  it("classifies nothing that is not on the surface", () => {
    const surface = new Set(publicSurface());
    const stale = [...Object.keys(CALLS), ...Object.keys(UNPROBEABLE)].filter(
      (method) => !surface.has(method),
    );

    expect(stale).toStrictEqual([]);
  });

  it("the chain-running doors are exactly the recorded ones", async () => {
    // Counted into a table first, filtered after: a branch inside the cell would
    // make the assertion depend on control flow the reader has to simulate.
    const counted: { method: string; runs: number }[] = [];

    for (const [method, call] of Object.entries(CALLS)) {
      counted.push({ method, runs: await chainRuns(call) });
    }

    counted.push({ method: "start", runs: await startChainRuns() });

    const running = counted
      .filter((entry) => entry.runs > 0)
      .map((entry) => entry.method);

    expect(
      running.toSorted((left, right) => left.localeCompare(right)),
    ).toStrictEqual(
      Object.keys(CHAIN_DOORS).toSorted((left, right) =>
        left.localeCompare(right),
      ),
    );
  });

  it("the bench prices exactly the doors recorded as tracked", () => {
    const tracked = Object.entries(CHAIN_DOORS)
      .filter(([, entry]) => entry.tracked)
      .map(([door]) => door)
      .toSorted((left, right) => left.localeCompare(right));

    expect(benchedDoors(readFileSync(BENCH, "utf8"))).toStrictEqual(tracked);
  });

  it("every untracked door carries a reason", () => {
    const untracked = Object.entries(CHAIN_DOORS).filter(
      ([, entry]) => !entry.tracked,
    );

    expect(untracked.length).toBeGreaterThan(0);
    expect(untracked.every(([, entry]) => entry.why.length > 0)).toBe(true);
  });

  it("the arm-label parser finds nothing in a file that has no arms", () => {
    // Positive control for the reader: a parser that matched nothing would make
    // the cell above pass by agreeing with an empty tracked set.
    expect(benchedDoors(readFileSync(BENCH, "utf8")).length).toBeGreaterThan(0);
    expect(
      benchedDoors("const x = 1; // seam/buildPath is only a word here"),
    ).toStrictEqual([]);
  });
});
