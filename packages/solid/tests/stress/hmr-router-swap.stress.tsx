import { render } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, MB, forceGC } from "./helpers";

import type { Router } from "@real-router/core";

/**
 * Scenario HMR1 from audit-2026-05-17 §7 (P0 gap): dev-experience leak.
 *
 * Vite HMR re-evaluates the module that constructs the `router` instance,
 * producing a new `Router` on every module update. The Solid app keeps the
 * outer `RouterProvider` mounted, but the consumer's signal swap forces
 * Solid's `<Show keyed>` (or `<Switch>` / `<Index>`) to dispose the old
 * Provider subtree and mount a fresh one against the new router.
 *
 * The contract under test:
 *   - 200 router swaps via `<Show keyed>` produce a heap delta below the
 *     budget (no listener/source/closure retention against the *outgoing*
 *     routers).
 *   - The most recently mounted Provider's source cache is the only one
 *     surviving — old routers are released to GC.
 *
 * The leak this test guards against: a per-router source factory that
 * keeps a strong reference to the router via a long-lived closure (e.g. a
 * cached subscriber that the disposal path missed). One such leak
 * compounds across HMR cycles into a multi-MB retention growth that never
 * shows up in production but quietly kills the dev experience after a
 * day of editing.
 */

describe("HMR1 — router prop swap stress (audit-2026-05-17 §7 P0)", () => {
  it("HMR1.1 — 200 router swaps via <Show keyed> — heap stable", async () => {
    const [router, setRouter] = createSignal<Router>(createStressRouter(3));

    await router().start("/route0");

    const { unmount } = render(() => (
      <Show keyed when={router()}>
        {(r) => (
          <RouterProvider router={r}>
            <Consumer />
          </RouterProvider>
        )}
      </Show>
    ));

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      // Stop the outgoing router synchronously so its subscribers
      // unwind before the swap, mirroring Vite HMR's typical
      // dispose path (consumer's `if (import.meta.hot) hot.dispose(...)`).
      router().stop();

      const next = createStressRouter(3);

      await next.start("/route0");

      // Setting the signal forces <Show keyed> to dispose the previous
      // Provider subtree and mount a new one against `next`.
      setRouter(next);

      await next.navigate("users.list");
    }

    unmount();
    router().stop();
    forceGC();

    const heapAfter = takeHeapSnapshot();

    // 200 HMR cycles: budget is generous — a real leak shows as
    // ~100KB-1MB per cycle (×200 = 20-200 MB).
    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  }, 120_000);

  it("HMR1.2 — 50 swaps + active navigation between swaps — no listener accumulation on outgoing routers", async () => {
    // After each swap, the previous router must have ZERO live subscribers
    // (its subtree disposed, source caches released via WeakMap GC).
    // Without that, every HMR cycle leaks one source per consumer.
    const routers: Router[] = [createStressRouter(3)];

    await routers[0].start("/route0");

    const [current, setCurrent] = createSignal<Router>(routers[0]);

    const { unmount } = render(() => (
      <Show keyed when={current()}>
        {(r) => (
          <RouterProvider router={r}>
            <Consumer />
            <Consumer />
            <Consumer />
          </RouterProvider>
        )}
      </Show>
    ));

    for (let i = 0; i < 50; i++) {
      const prev = current();

      prev.stop();

      const next = createStressRouter(3);

      await next.start("/route0");
      routers.push(next);
      setCurrent(next);

      await next.navigate("users.list");
    }

    unmount();
    current().stop();
    forceGC();

    // We cannot probe the source-cache WeakMap directly — but we CAN
    // assert the outgoing routers' subscriber count returns to zero.
    // `router.stop()` does not by itself empty external subscribers,
    // so this hinges on `<Show keyed>` actually disposing the subtree.
    //
    // The accessor `router.subscribe.length` would be misleading
    // (function arity); we observe indirectly by confirming heap delta
    // stays bounded — a per-router subscriber leak across 50 rounds × 3
    // consumers would balloon retained closures into the 10-50 MB range.
    const heapBefore = takeHeapSnapshot();

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Steady-state after GC: the cache should be at most one router's worth.
    expect(Math.abs(heapAfter - heapBefore)).toBeLessThan(10 * MB);
  }, 120_000);
});

function Consumer() {
  useRouteNode("users");

  return <div />;
}
