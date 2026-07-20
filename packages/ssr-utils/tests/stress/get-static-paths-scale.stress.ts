import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { getStaticPaths } from "@real-router/ssr-utils";

import { measureTimeAsync } from "./helpers";

/**
 * Leaf-enumeration robustness + throughput for `getStaticPaths` (the SSG path
 * enumerator). It walks the route tree collecting leaf route names, then
 * `buildPath`s each — run at build time over a project's full route set.
 *
 * SKEPTICAL HYPOTHESIS (not behavior-pinning): `getLeafRouteNames` accumulates
 * a subtree's leaves with `result.push(...getLeafRouteNames(child))` — a SPREAD
 * whose argument count equals the number of leaves in that subtree. V8 caps
 * spread/apply arguments (~124k on Node 24, measured); past that, `push(...big)`
 * throws `RangeError: Maximum call stack size exceeded` — a cryptic failure that
 * reads like infinite recursion, not "too many routes". A large content site
 * (many static leaf routes under one section) can cross that line.
 *
 * Discrimination: a single intermediate node with > the spread limit of static
 * leaf children. Correct code enumerates all of them; the spread regression
 * throws. Plus a no-drop count + order check and a catastrophe-only timing
 * ceiling (enumeration is O(leaves) by construction).
 */
describe("S28. getStaticPaths leaf enumeration at scale", () => {
  // Above the measured ~124,395 spread-argument limit, with margin, so the
  // spread path throws deterministically across engine-version drift.
  const LEAVES = 200_000;

  it(`enumerates ${LEAVES} static leaves under one parent without RangeError`, async () => {
    const children = Array.from({ length: LEAVES }, (_, i) => ({
      name: `p${i}`,
      path: `/p${i}`,
    }));
    const router = createRouter([{ name: "g", path: "/g", children }]);

    const { result: paths, durationMs } = await measureTimeAsync(() =>
      getStaticPaths(router),
    );

    // No drop: every leaf enumerated, in tree order.
    expect(paths).toHaveLength(LEAVES);
    expect(paths[0]).toBe("/g/p0");
    expect(paths.at(-1)).toBe(`/g/p${LEAVES - 1}`);

    // Catastrophe-only ceiling (linear enumeration + buildPath per leaf).
    expect(
      durationMs,
      `enumerated ${paths.length} paths in ${durationMs.toFixed(0)}ms`,
    ).toBeLessThan(10_000);

    router.dispose();
  });
});
