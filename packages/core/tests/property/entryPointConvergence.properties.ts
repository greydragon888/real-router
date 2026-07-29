import { fc, test } from "@fast-check/vitest";
import { describe, expect, beforeAll, afterAll } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

/**
 * THE PHASE LOCK (nav-pipeline Phase 2, step 2-8) — "entry points of ONE
 * compositional form, on one intent, produce one `Canonical`".
 *
 * This is the property the whole phase exists to make expressible. It needs ≥2
 * migrated points per class, so after milestone 1 it could not be written at all
 * (class ① held only `navigate`). With all seven points on the pipeline it can,
 * and what it locks is the thing the phase actually bought: not "each point
 * still works", but "no two points can drift apart again", because a divergence
 * is now a property failure rather than a bug someone has to notice.
 *
 * TWO CLASSES, and the split is the point — they are NOT interchangeable:
 *  - class ① (resolves `forwardTo`): `navigate` · `matchPath` ·
 *    `buildNavigationState`;
 *  - class LITERAL (`{ resolveForward: false }`): `buildPath` · `makeState` ·
 *    `isActiveRoute`'s first arm.
 * A route that forwards is exactly where the two classes must DISAGREE, so the
 * fixtures below deliberately include one.
 *
 * FOUR CAVEATS, all inherited from the parent RFC's §5 and all load-bearing:
 *  1. `isActiveRoute` enters only through its FIRST arm — its second arm is the
 *     "with ①" form, so it belongs to neither class cleanly. It is exercised as
 *     a boolean consequence, not as a `Canonical`.
 *  2. `forwardState` is in NO class: its output is `Resolved` (stage ① alone,
 *     no ③ — INVARIANTS forwardState #7), not a `Canonical`.
 *  3. Equality with `matchPath` holds only up to `areParamValuesEqual`: the URL
 *     direction parses (`?page=2` → number) while an intent keeps what the
 *     caller passed (decision (б′)), so values are compared by printed form.
 *  4. `canNavigateTo` returns a `boolean`, so its `Canonical` is observable only
 *     from inside the module. It is NOT asserted structurally here — writing it
 *     through the public return would be a tautology, which is precisely the
 *     caveat the parent records.
 */

const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  // Both channels + a default in each slot: the shape where a drift between two
  // producers would actually show up.
  {
    name: "item",
    path: "/item/:id?tab&sort",
    defaultParams: { id: "0" },
    defaultSearch: { tab: "new" },
  },
  // A forwarding alias — the fixture that separates the two classes.
  { name: "alias", path: "/alias", forwardTo: "item" },
];

const arbVal = fc.stringMatching(/^[a-zA-Z0-9_-]{1,8}$/);
const arbId = fc.stringMatching(/^[a-zA-Z0-9_-]{1,6}$/);
/** Partial declared-query bag: any subset of the route's `?`-declared names. */
const arbSearch = fc.record(
  { tab: arbVal, sort: arbVal },
  { requiredKeys: [] },
);

/** Values compared by PRINTED form — caveat 3 (`areParamValuesEqual` domain).
 * Generated values are URL-safe scalars, so `String()` is exactly the printed
 * form; key order is normalised because the two directions build their bags in
 * different orders. */
const printed = (
  bag: Record<string, string | number | boolean | undefined>,
): Record<string, string> => {
  const out: Record<string, string> = {};

  for (const key of Object.keys(bag).toSorted((x, y) => x.localeCompare(y))) {
    const value = bag[key];

    if (value !== undefined) {
      out[key] = String(value);
    }
  }

  return out;
};

describe("core/pipeline — entry-point convergence (nav-pipeline Phase 2 lock)", () => {
  let router: Router;
  let pluginApi: ReturnType<typeof getPluginApi>;

  beforeAll(async () => {
    router = createRouter(ROUTES);
    pluginApi = getPluginApi(router);
    await router.start("/home");
  });

  afterAll(() => {
    router.stop();
  });

  // 1. CLASS ①. Every point that resolves `forwardTo` commits the same state for
  //    the same intent — asserted on the alias, so the assertion is about
  //    RESOLUTION and not merely about a shared merge.
  test.prop([arbId, arbSearch], { numRuns: NUM_RUNS.standard })(
    "class ①: navigate / matchPath / buildNavigationState agree on one intent",
    async (id, search) => {
      const committed = await router.navigate("alias", { id }, search, {
        reload: true,
      });
      const built = pluginApi.buildNavigationState("alias", { id }, search);
      const rematched = pluginApi.matchPath(committed.path);

      // All three resolve the alias to its target.
      expect(built?.name).toBe(committed.name);
      expect(rematched?.name).toBe(committed.name);

      // …and agree on both channels and the URL. `matchPath` is compared by
      // printed form (caveat 3): it parses the query out of a URL, so `"2"`
      // arrives as `2`.
      expect(printed(built!.params as Record<string, string>)).toStrictEqual(
        printed(committed.params as Record<string, string>),
      );
      expect(printed(built!.search as Record<string, string>)).toStrictEqual(
        printed(committed.search as Record<string, string>),
      );
      expect(built!.path).toBe(committed.path);

      expect(
        printed(rematched!.params as Record<string, string>),
      ).toStrictEqual(printed(committed.params as Record<string, string>));
      expect(
        printed(rematched!.search as Record<string, string>),
      ).toStrictEqual(printed(committed.search as Record<string, string>));
    },
  );

  // 2. CLASS LITERAL. `buildPath` and `makeState` are the same composition minus
  //    stage ①, so the state's own path must be the URL `buildPath` prints.
  test.prop([arbId, arbSearch], { numRuns: NUM_RUNS.standard })(
    "class LITERAL: makeState's path is exactly what buildPath prints",
    (id, search) => {
      const state = pluginApi.makeState("item", { id }, search);

      expect(state.path).toBe(router.buildPath("item", { id }, search));
    },
  );

  // 3. THE CLASSES MUST DIFFER — on a forwarding route, and only there. Without
  //    this the two properties above could both pass on a router where
  //    `resolveForward` was ignored entirely, which is the one regression the
  //    lock exists to catch.
  test.prop([arbId], { numRuns: NUM_RUNS.fast })(
    "the two classes diverge on a forwarding route, and nowhere else",
    async (id) => {
      const resolved = await router.navigate(
        "alias",
        { id },
        {},
        { reload: true },
      );

      // Class ① follows the alias…
      expect(resolved.name).toBe("item");
      // …while the literal form stays on the name it was given.
      expect(pluginApi.makeState("alias").name).toBe("alias");
      expect(router.buildPath("alias")).toBe("/alias");

      // On a NON-forwarding route the two classes coincide again.
      expect(pluginApi.makeState("item", { id }).path).toBe(
        router.buildPath("item", { id }),
      );
    },
  );

  // 4. `isActiveRoute`, first arm only (caveat 1): whatever class ① commits, the
  //    predicate reports as active when asked with the same channels. A boolean
  //    consequence of convergence rather than a structural assertion.
  test.prop([arbId, arbSearch], { numRuns: NUM_RUNS.standard })(
    "isActiveRoute's literal arm agrees with what class ① committed",
    async (id, search) => {
      const committed = await router.navigate("item", { id }, search, {
        reload: true,
      });

      expect(committed.name).toBe("item");
      expect(router.isActiveRoute("item", { id }, search)).toBe(true);
    },
  );
});
