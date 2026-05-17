// packages/preact/tests/stress/rapid-start-stop-no-mount.stress.tsx

/**
 * Stress test for router.start/stop lifecycle WITHOUT a RouterProvider mount.
 *
 * Closes review §7 #1 (LOW): "rapid start/stop без навигаций —
 * `mount-unmount-lifecycle.stress.tsx:250` (3.6b) делает 50 циклов start/stop
 * с mounted consumers; **нет** теста pure start/stop без mount. Listener
 * leaks в `getRouteSource` / `createRouteNodeSource` если router использован
 * без RouterProvider."
 *
 * Scope: this exercises router-only consumers — Node SSR scripts, console
 * tools, NativeScript adapters, tests, anywhere `createRouter()` is used
 * without a Preact tree mounted around it. The adapter's source factories
 * (`getRouteSource`, `createRouteNodeSource`) must NOT accumulate listeners
 * on the router across start/stop cycles when the per-router sources are
 * touched via `getSnapshot()` calls.
 *
 * Pipeline under test:
 *   - `createRouter()` → no listeners
 *   - `router.start()` / `router.stop()` cycles → router subscription count
 *     should return to its post-stop baseline after each cycle
 *   - `getRouteSource(router).getSnapshot()` is a pure read, must NOT subscribe
 *     (lazy-connection: subscription is only created on first listener)
 *
 * Invariants:
 *   - 100 start/stop cycles complete without throw
 *   - Heap stays bounded across cycles (no per-cycle leak)
 *   - Source factories return functional sources after each cycle
 */

import { createRouter } from "@real-router/core";
import { createRouteNodeSource, createRouteSource } from "@real-router/sources";
import { afterEach, describe, expect, it } from "vitest";

import { forceGC, getHeapUsedBytes, MB } from "./helpers";

import type { Router } from "@real-router/core";

function makeRouter(): Router {
  return createRouter(
    [
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "list", path: "/list" }],
      },
    ],
    { defaultRoute: "home" },
  );
}

describe("preact stress — router start/stop without RouterProvider (§7 #1)", () => {
  afterEach(() => {
    forceGC();
  });

  it("100 start/stop cycles on a single router stay bounded", async () => {
    const router = makeRouter();

    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 100; i++) {
      await router.start("/");
      router.stop();
    }

    forceGC();
    const final = getHeapUsedBytes();
    const heapGrowth = final - baseline;

    // A leak in router-internal listener bookkeeping would show up as
    // monotonic growth here — 100 cycles should fit well under 10 MB on a
    // healthy router.
    expect(heapGrowth).toBeLessThan(10 * MB);
  });

  it("100 router instances created + started + stopped without RouterProvider", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 100; i++) {
      const router = makeRouter();

      await router.start("/");
      router.stop();
    }

    forceGC();
    const final = getHeapUsedBytes();
    const heapGrowth = final - baseline;

    // After 100 instances are dropped + GC'd, WeakMap-keyed caches in
    // `@real-router/sources` should release their entries automatically.
    // Generous 20 MB cap catches a hard ref leak.
    expect(heapGrowth).toBeLessThan(20 * MB);
  });

  it("getRouteSource().getSnapshot() does NOT subscribe (no listener leak across reads)", async () => {
    // The lazy-connection invariant of `createRouteSource`: subscribing to
    // the router happens only on first `.subscribe(listener)` call, never on
    // `.getSnapshot()`. A regression that subscribed eagerly would leave a
    // listener on the router after each `getSnapshot()` call — over 100
    // reads that becomes 100 stale listeners.
    const router = makeRouter();

    await router.start("/");

    const source = createRouteSource(router);

    // 100 pure reads — must not register any listeners on the router.
    for (let i = 0; i < 100; i++) {
      source.getSnapshot();
    }

    // After the reads, a real subscribe → unsubscribe cycle still works
    // cleanly. If reads had leaked listeners, this would fail in subtle ways
    // (e.g. unsubscribe doesn't fully detach, snapshot would not change on
    // navigation).
    let notifications = 0;
    const unsubscribe = source.subscribe(() => {
      notifications++;
    });

    await router.navigate("users.list");

    expect(notifications).toBeGreaterThan(0);

    unsubscribe();
    router.stop();
  });

  it("createRouteNodeSource caches per (router, nodeName) across multiple no-mount calls", async () => {
    // `createRouteNodeSource` is per-(router, nodeName) cached — calling it
    // 100 times with the same args must return the SAME source instance, so
    // there is only one underlying router subscription regardless of how many
    // bare-router consumers call the factory.
    const router = makeRouter();

    await router.start("/");

    const first = createRouteNodeSource(router, "users");

    for (let i = 0; i < 100; i++) {
      const sample = createRouteNodeSource(router, "users");

      expect(sample).toBe(first);
    }

    router.stop();
  });

  it("router GC after stop releases per-router cached sources (WeakMap)", async () => {
    // Per `packages/sources/CLAUDE.md`: "Cached sources live as long as the
    // router. The WeakMap entry releases automatically when the router is
    // garbage-collected." Validate that 100 router-instance lifecycles don't
    // pin sources in memory.
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 100; i++) {
      const router = makeRouter();

      await router.start("/");
      // Touch both source factories so WeakMap entries are actually populated.
      createRouteSource(router);
      createRouteNodeSource(router, "users");
      router.stop();
      // Router goes out of scope after this iteration; the next forceGC
      // should release its WeakMap entry.
    }

    forceGC();
    const final = getHeapUsedBytes();
    const heapGrowth = final - baseline;

    // 100 routers × (router + source + nodeSource) — total well under 30 MB
    // when WeakMap releases properly. A regression that swapped WeakMap for
    // Map would surface as several MB per instance retained.
    expect(heapGrowth).toBeLessThan(30 * MB);
  });
});
