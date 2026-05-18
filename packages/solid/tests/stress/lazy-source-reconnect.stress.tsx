import { createRouteNodeSource } from "@real-router/sources";
import { renderHook } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/solid";

import { createStressRouter, forceGC, MB, takeHeapSnapshot } from "./helpers";

import type { JSX } from "solid-js";

/**
 * §7.2 audit scenario G1 — `createSignalFromSource` re-sync race when a
 * cached lazy source reconnects.
 *
 * Concern: cached `createRouteNodeSource(router, name)` is lazy — it
 * disconnects from the router when its last listener unsubscribes, and
 * reconciles its snapshot in `onFirstSubscribe` when a new listener
 * arrives. The Solid bridge `createSignalFromSource` issues
 * `setValue(sync)` AFTER `subscribe(...)` to catch that internal
 * reconcile (otherwise the just-added listener never learns about it).
 *
 * Race surface: rapid mount → unmount → mount-one-tick-later
 * (Activity-like remount) — if `setValue(sync)` ever lands on a
 * disposed owner, the new accessor reports stale snapshot. This stress
 * covers 100+ such cycles to ensure the post-subscribe re-read always
 * lands correctly.
 */

describe("LSR1 — createSignalFromSource lazy reconnect race (§7.2 G1)", () => {
  it("LSR1.1: 150 mount→unmount→remount cycles on cached lazy source — accessor always fresh", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");
    await router.navigate("users.list");

    const ITERATIONS = 150;
    const heapBefore = takeHeapSnapshot();
    const observed: (string | undefined)[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      // First mount — subscribes to the cached source.
      const { result, cleanup } = renderHook(() => useRouteNode("users"), {
        wrapper: (p: { children: JSX.Element }) => (
          <RouterProvider router={router}>{p.children}</RouterProvider>
        ),
      });

      observed.push(result().route?.name);
      cleanup();

      // Mid-cycle navigation — source's snapshot changes while NO
      // listener is subscribed (cached source goes lazy).
      const target = i % 2 === 0 ? "users.view" : "users.list";

      await router.navigate(target, i % 2 === 0 ? { id: String(i) } : {});

      // Remount — the cached source reconciles its snapshot in
      // `onFirstSubscribe`; the new bridge instance must pick up the
      // change via `setValue(sync)` after subscribe.
      const { result: result2, cleanup: cleanup2 } = renderHook(
        () => useRouteNode("users"),
        {
          wrapper: (p: { children: JSX.Element }) => (
            <RouterProvider router={router}>{p.children}</RouterProvider>
          ),
        },
      );

      // The fresh accessor MUST observe the latest snapshot — the route
      // we just navigated to. If `setValue(sync)` raced with dispose,
      // result2 would report the prior name.
      expect(result2().route?.name).toBe(target);

      observed.push(result2().route?.name);

      cleanup2();
    }

    forceGC();
    const heapAfter = takeHeapSnapshot();

    // All observed values are defined (no stale undefined leak).
    expect(observed.every((name) => name !== undefined)).toBe(true);

    // Heap budget: 150 mount/unmount/mount/unmount cycles on a single
    // cached source. Bounded at 20MB — a regression that retains
    // disposed bridges would blow past this.
    expect(heapAfter - heapBefore).toBeLessThan(20 * MB);

    router.stop();
  }, 60_000);

  it("LSR1.2: cache eviction on full disconnect → fresh source after re-subscribe", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    // Mount, observe, unmount → cached source's listener count drops
    // to 0 → source disconnects.
    const sourceBefore = createRouteNodeSource(router, "users");

    expect(sourceBefore.getSnapshot()).toBeDefined();

    const { result, cleanup } = renderHook(() => useRouteNode("users"), {
      wrapper: (p: { children: JSX.Element }) => (
        <RouterProvider router={router}>{p.children}</RouterProvider>
      ),
    });

    await router.navigate("users.list");

    expect(result().route?.name).toBe("users.list");

    cleanup();

    // Navigate while no listeners — source goes lazy.
    await router.navigate("users.view", { id: "42" });

    // Re-mount → bridge subscribes → cached source reconciles in
    // `onFirstSubscribe` → bridge picks up the navigation that happened
    // while disconnected.
    const { result: result2, cleanup: cleanup2 } = renderHook(
      () => useRouteNode("users"),
      {
        wrapper: (p: { children: JSX.Element }) => (
          <RouterProvider router={router}>{p.children}</RouterProvider>
        ),
      },
    );

    expect(result2().route?.name).toBe("users.view");
    expect(result2().route?.params).toStrictEqual({ id: "42" });

    cleanup2();
    router.stop();
  });
});
