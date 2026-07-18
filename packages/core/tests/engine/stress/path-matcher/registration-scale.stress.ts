import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

import type { SimpleRoute } from "../../helpers/buildTree";

/**
 * Scale guard for trie registration breadth.
 *
 * Registration walks the whole route set once and builds the segment trie +
 * static cache. This asserts what coverage cannot: across thousands of distinct
 * routes, registration (a) stays well below quadratic and (b) drops/aliases no
 * route — every sampled route still matches under its own name with its own
 * param key. The discriminating signal is "did any of N routes get lost or
 * cross-wired in the breadth", which one example can't establish.
 *
 * **Why depth is not guarded here:** `registerNode` recurses per nesting level,
 * so a route tree thousands of levels deep overflows the JS call stack
 * (RangeError) — but that is an engine stack limit at an absurd depth (real
 * trees are <20 deep) that fails *loudly*, not a module-specific regression
 * signal. A depth guard would assert the engine's stack size, not path-matcher
 * behavior, so it is intentionally omitted (no discriminating power).
 */

describe("S1: 10,000 distinct routes register and match without drop or alias", () => {
  const N = 10_000;

  it(`registers ${N} distinct param routes; every sampled route matches correctly`, () => {
    // Distinct static prefix + distinct param name per route ⇒ distinct trie
    // branches and param positions. A breadth bug (lost route, swapped key,
    // colliding static cache entry) surfaces as a wrong/absent match below.
    const routes: SimpleRoute[] = Array.from({ length: N }, (_, i) => ({
      name: `r${i}`,
      path: `/p${i}/seg/:id${i}`,
    }));

    const start = performance.now();

    const matcher = createMatcher(routes);

    const registerMs = performance.now() - start;

    for (let i = 0; i < N; i += 113) {
      const result = matcher.match(`/p${i}/seg/v${i}`);

      expect(result?.segments.at(-1)?.fullName).toBe(`r${i}`);
      expect(result?.params).toStrictEqual({ [`id${i}`]: `v${i}` });
    }

    // Catastrophe-guard (measured healthy ~50 ms, ≈35× margin): catches a
    // severe super-linear registration blowup (verified: an O(n²) body heavy
    // enough to model a real regression pushes registerMs past this ceiling). A
    // cheap-constant O(n²) at 10k still sits UNDER it (~230 ms measured), so this
    // is deliberately a catastrophe ceiling, not a quadratic detector — the
    // no-drop/alias correctness sampled above is the precise guard.
    expect(registerMs).toBeLessThan(2000);
  });
});

describe("S2: a wide static fan-out matches in O(1) via the static cache", () => {
  const N = 10_000;

  it(`registers ${N} sibling static routes and matches a sample in constant time`, () => {
    const routes: SimpleRoute[] = Array.from({ length: N }, (_, i) => ({
      name: `s${i}`,
      path: `/s${i}`,
    }));

    const matcher = createMatcher(routes);

    // Every static route resolves through the precomputed static cache; a sample
    // across the full breadth must hit the right route with empty params.
    for (let i = 0; i < N; i += 97) {
      const result = matcher.match(`/s${i}`);

      expect(result?.segments.at(-1)?.fullName).toBe(`s${i}`);
      expect(result?.params).toStrictEqual({});
    }
  });
});
