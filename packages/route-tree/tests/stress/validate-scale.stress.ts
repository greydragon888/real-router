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
 *
 * `validateRoute` also recurses into `children`, so S5 adds a recursion-depth
 * guard for deeply nested batches — the third recursive function in the package
 * (alongside buildTree/createNode and routeTreeToDefinitions/nodeToDefinition,
 * guarded by build-scale S2 / roundtrip-scale S3b). The flat S4 batches have no
 * children, so they never recurse — without S5 that branch has zero scale
 * coverage despite being the opt-in validation hot path on every nested config.
 */

function validateBatch(routes: RouteDefinition[]): Set<string> {
  // Mirrors validation-plugin's batch loop (validators/routes.ts): shared
  // tracking structures, no existing tree (fresh registration → only the
  // batch-level Set/Map checks run). Returns `seenNames` so callers can assert
  // full-recursion traversal (S5); the S4 duplicate tests ignore the return.
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

  return seenNames;
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

describe("S4: validate scale — 50k-route duplicate detection stays linear", () => {
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

// NEST_DEPTH matches build-scale S2 / roundtrip-scale S3b: deep enough to make
// the recursion meaningful (~50× any realistic route tree) yet comfortably below
// the env-sensitive forks-pool stack cliff (~2–4k — the cliff is NOT asserted; a
// crank to 12k overflows, confirming this sits under it). validateRoute is ~1
// frame/level; the helper builds the INPUT iteratively (leaf → root) so only
// validateRoute's own recursion is exercised. No heap/timing: recursion is
// O(nodes) with no quadratic target.
const NEST_DEPTH = 1000;

function buildDeepNesting(
  deepestChildren?: RouteDefinition[],
): RouteDefinition {
  let def: RouteDefinition = {
    name: `n${NEST_DEPTH - 1}`,
    path: `/s${NEST_DEPTH - 1}`,
  };

  if (deepestChildren) {
    def.children = deepestChildren;
  }

  for (let i = NEST_DEPTH - 2; i >= 0; i--) {
    def = { name: `n${i}`, path: `/s${i}`, children: [def] };
  }

  return def;
}

describe("S5: deep validation — validateRoute recurses the full nesting depth", () => {
  it(`catches a duplicate PATH buried ${NEST_DEPTH} levels deep`, () => {
    // Two siblings sharing a path under the DEEPEST parent: a conflict that only
    // surfaces if validateRoute recurses all NEST_DEPTH levels to reach it.
    // Discriminates two ways — a recursion that truncates/caps depth never sees
    // the conflict → no throw; a refactor adding stack frames per level overflows
    // first → RangeError (message ≠ /already defined/). Both break this assert.
    const def = buildDeepNesting([
      { name: "a", path: "/dup" },
      { name: "b", path: "/dup" }, // same path, same (deepest) parent → conflict
    ]);

    expect(() => {
      validateBatch([def]);
    }).toThrow(/Path "\/dup" is already defined/);
  });

  it(`records every level of a valid ${NEST_DEPTH}-deep nesting (full traversal)`, () => {
    // Structural result, not a bare not.toThrow (validateRoute returns void): the
    // shared seenNames Set must hold one fullName per node, proving the recursion
    // visited every level — the validateRoute analog of build-scale S2's
    // `level === DEPTH-1` walk. A truncated recursion records < NEST_DEPTH names;
    // an overflow throws before the assert.
    const seenNames = validateBatch([buildDeepNesting()]);

    expect(seenNames.size).toBe(NEST_DEPTH);
  });
});
