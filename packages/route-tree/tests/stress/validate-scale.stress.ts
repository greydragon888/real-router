import { describe, expect, it } from "vitest";

import { validateRoute } from "../../src/validation/route-batch";

import type { RouteDefinition } from "../../src/types";

/**
 * Scale guards for `validateRoute`'s batch duplicate detection — the opt-in
 * validation path (`@real-router/validation-plugin` runs it over the FULL route
 * set at registration, and on every `addRoute`). Note `createRouteTree` itself
 * does NOT validate (validation is opt-in), so duplicate detection lives here,
 * not in the build pipeline — these tests target it directly.
 *
 * Duplicate detection is O(n): names via a `Set`, paths via a
 * `Map<parent, Set<path>>`. No heap assertions (validation allocates only the
 * tracking Set/Map, GC'd after); the signals are anti-quadratic timing and
 * buried-conflict correctness.
 */

function validateBatch(routes: RouteDefinition[]): void {
  // Mirrors validation-plugin's batch loop (validators/routes.ts): shared
  // tracking structures, no existing tree (fresh registration → only the
  // batch-level Set/Map checks run).
  const seenNames = new Set<string>();
  const seenPathsByParent = new Map<string, Set<string>>();

  for (const route of routes) {
    validateRoute(
      route,
      "addRoute",
      undefined,
      "",
      seenNames,
      seenPathsByParent,
    );
  }
}

// N is deliberately large. The targeted regression is `seenNames` (Set.has) /
// `seenPathsByParent` (Map<parent,Set>) → array + `.includes`, i.e. O(n²). But
// the quadratic *constant* is tiny, so the signal must be large enough to clear
// the ceiling with margin. Mutationally measured under the `forks` pool:
//   N      healthy (Set)   broken (array, O(n²))
//   10 000     5 ms            138 ms   ← a 1 s ceiling here would be THEATRE
//   30 000     9 ms          1 250 ms
//   50 000    15 ms          3 734 ms   ← chosen
// At N=50 000 the ceiling sits ~33× above healthy and ~7.5× below the broken
// signal — discriminating on both sides, non-flaky under CPU load.
const ROUTES = 50_000;
const VALIDATE_MS_CEILING = 500;

describe("S4: validate scale — 10k-route duplicate detection stays linear", () => {
  it(`validates ${ROUTES} unique routes under ${VALIDATE_MS_CEILING}ms`, () => {
    const routes: RouteDefinition[] = Array.from(
      { length: ROUTES },
      (_, i) => ({ name: `r${i}`, path: `/r${i}` }),
    );

    const t0 = performance.now();

    validateBatch(routes);
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(VALIDATE_MS_CEILING);
  });

  // Correctness-at-scale: a conflict buried mid-batch must still be caught (not
  // lost in the breadth). The exact message is the discriminator — a short-circuit
  // or off-by-one in the scan that skips the buried route makes these NOT throw.
  it("catches a duplicate NAME buried in a 5k batch", () => {
    const routes: RouteDefinition[] = Array.from({ length: 5000 }, (_, i) => ({
      name: `r${i}`,
      path: `/r${i}`,
    }));

    routes.splice(2500, 0, { name: "r0", path: "/dupe" }); // re-uses name r0

    expect(() => {
      validateBatch(routes);
    }).toThrow(/Duplicate route "r0" in batch/);
  });

  it("catches a duplicate PATH buried in a 5k batch", () => {
    const routes: RouteDefinition[] = Array.from({ length: 5000 }, (_, i) => ({
      name: `u${i}`,
      path: `/p${i}`,
    }));

    routes.splice(2500, 0, { name: "ux", path: "/p0" }); // re-uses path /p0

    expect(() => {
      validateBatch(routes);
    }).toThrow(/Path "\/p0" is already defined/);
  });
});
