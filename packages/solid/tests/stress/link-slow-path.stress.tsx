import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createStressRouter, forceGC, takeHeapSnapshot, MB } from "./helpers";

/**
 * §7.3 audit scenarios #19 + #22 — Link slow-path init-capture stress
 * + createSelector O(1) correctness under high Link count.
 *
 * #19 — Link Props Captured at Init (Slow Path) gotcha:
 *   When `activeStrict=true` / `ignoreQueryParams=false` / custom
 *   `routeParams` / `hash` is set, Link uses `createActiveRouteSource`
 *   which captures `routeName` at component init. Dynamic parent-side
 *   changes to routeName are NOT reactive. Lock the gotcha under stress:
 *   100+ navigations with a dynamically-changing parent-supplied routeName
 *   must NOT update the slow-path active class.
 *
 * #22 — createSelector O(1) correctness:
 *   `RouterProvider` builds a `createSelector`-backed routeSelector for the
 *   fast-path active route detection. With 200+ Links and 1000+ navs, the
 *   selector should only notify the 2 Links involved (prev-active + new-active)
 *   per nav. We lock the perf budget — total wall time over 1000 navs against
 *   200 Links must stay under a generous threshold; a regression to O(N)
 *   would blow it.
 */
describe("LSP1 — Link slow-path init-capture (§7.3 #19)", () => {
  it("LSP1.1: 150 navs with reactive parent routeName on slow-path Link — active class DOES NOT update", async () => {
    // activeStrict=true triggers the slow path in Link. The parent provides
    // routeName via a signal that we flip 150 times — the slow path captured
    // the INITIAL value at mount and must not see subsequent changes.
    const router = createStressRouter(20);

    await router.start("/route0");

    const [dynamicName, setDynamicName] = createSignal("route1");

    render(() => (
      <RouterProvider router={router}>
        <Link
          routeName={dynamicName()}
          activeStrict
          activeClassName="active"
          data-testid="link"
        >
          Dynamic
        </Link>
      </RouterProvider>
    ));

    const link = screen.getByTestId("link");

    // Captured initial: routeName === "route1". Current state: route0.
    // Not active.
    expect(link.classList.contains("active")).toBe(false);

    // Navigate to route1 — captured matches, Link should be active.
    await router.navigate("route1");
    expect(link.classList.contains("active")).toBe(true);

    // Now stress: 150 cycles. Each cycle flips the signal to a route
    // and navigates to that route. If the slow path was reactive (gotcha
    // broken), the Link would toggle. The gotcha says it does NOT — the
    // captured "route1" is the only routeName the source ever sees.
    let unexpectedReactivity = 0;

    for (let i = 0; i < 150; i++) {
      const target = `route${(i % 18) + 2}`; // route2..route19

      setDynamicName(target);
      await router.navigate(target);

      // Per the gotcha: slow path is hash-aware / activeStrict-locked at
      // init. The captured routeName === "route1" mismatches the current
      // state ("route2"+), so the Link must NOT have the active class.
      // (Even though the JSX is rendering `routeName={dynamicName()}` —
      // that's the value the JSX prop displays, but the active source
      // captured the OLD value.)
      if (link.classList.contains("active")) {
        unexpectedReactivity++;
      }
    }

    // The gotcha must hold every iteration — the slow path is frozen.
    expect(unexpectedReactivity).toBe(0);

    router.stop();
  }, 60_000);
});

describe("LSP2 — createSelector O(1) under 200 Links × 1000 navs (§7.3 #22)", () => {
  it("LSP2.1: 200 fast-path Links + 1000 navs — wall time within O(N) budget", async () => {
    const router = createStressRouter(30);

    await router.start("/route0");

    const N_LINKS = 200;
    const LINK_INDICES = Array.from({ length: N_LINKS }, (_, i) => i);

    // 200 Links with the FAST path (no activeStrict/custom params/hash).
    // Routes 0..29 exist, so links 30..199 are "no-match" — they still
    // subscribe through the selector but never light up.
    render(() => (
      <RouterProvider router={router}>
        {LINK_INDICES.map((i) => (
          <Link routeName={`route${i % 30}`} data-testid={`l-${i}`}>
            L{i}
          </Link>
        ))}
      </RouterProvider>
    ));

    // Warm up jit/microtask machinery.
    await router.navigate("route1");
    await router.navigate("route0");

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 1000;
    const start = performance.now();

    for (let i = 0; i < ITERATIONS; i++) {
      const target = `route${(i + 1) % 30}`;

      await router.navigate(target);
    }

    const elapsed = performance.now() - start;

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Budget: 200 Links × 1000 navs with O(1) selector dispatch.
    // Real-world headroom on CI is ~10-20ms per nav. Cap at 60s wall
    // (60ms per nav average) — an O(N_Links) regression would push
    // wall time well past 120s.
    expect(elapsed).toBeLessThan(60_000);

    // Heap budget: 200 Links + 1000 transitions through the selector
    // should not retain incremental state. 30MB cap (jsdom DOM overhead
    // is the dominant term, not the router internals).
    expect(heapAfter - heapBefore).toBeLessThan(30 * MB);

    router.stop();
  }, 120_000);
});
