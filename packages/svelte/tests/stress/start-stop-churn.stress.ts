import { render } from "@testing-library/svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import MountUnmountProbe from "./components/MountUnmountProbe.svelte";
import { createStressRouter, forceGC, MB, takeHeapSnapshot } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

// Audit follow-up #2.1 — rapid mount/unmount of RouterProvider with a child
// that calls useRouteExit + useRoute, without any navigate() between cycles.
// The point is to prove that $effect / onDestroy cleanup is honoured: if any
// composable forgets to release its subscription, leave listeners pile up
// invisibly on the router (small closures, easy to miss in heap deltas) and
// turn into stale updates after enough cycles.

describe("Stress: start/stop churn (no navigation)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(8);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  // Spy on router.subscribeLeave / router.subscribe and track active
  // (subscribed minus unsubscribed) listener counts. The router does not
  // expose listener counts publicly, so this is the least invasive way to
  // check that cleanup runs. Both bound methods are replaced with thin
  // wrappers that increment on call and decrement on returned unsubscribe.
  function instrumentRouter(target: Router): {
    leaveActive: () => number;
    subscribeActive: () => number;
    restore: () => void;
  } {
    const originalSubscribeLeave = target.subscribeLeave.bind(target);
    const originalSubscribe = target.subscribe.bind(target);

    let leaveActive = 0;
    let subscribeActive = 0;

    target.subscribeLeave = ((
      listener: Parameters<Router["subscribeLeave"]>[0],
    ) => {
      leaveActive++;
      const off = originalSubscribeLeave(listener);

      return ((): void => {
        leaveActive--;
        off();
      }) as Unsubscribe;
    }) as Router["subscribeLeave"];

    target.subscribe = ((listener: Parameters<Router["subscribe"]>[0]) => {
      subscribeActive++;
      const off = originalSubscribe(listener);

      return ((): void => {
        subscribeActive--;
        off();
      }) as Unsubscribe;
    }) as Router["subscribe"];

    return {
      leaveActive: () => leaveActive,
      subscribeActive: () => subscribeActive,
      restore: () => {
        target.subscribeLeave = originalSubscribeLeave;
        target.subscribe = originalSubscribe;
      },
    };
  }

  it("16.1 mount/unmount RouterProvider × 1000 cycles — leave listeners released, heap stable", () => {
    const probe = instrumentRouter(router);

    const baselineLeave = probe.leaveActive();

    // Warmup — first few mounts allocate WeakMap-backed source caches in
    // @real-router/sources; we want the steady-state delta, not the warmup.
    for (let i = 0; i < 50; i++) {
      const { unmount } = render(MountUnmountProbe, {
        props: { router },
      });

      unmount();
    }

    forceGC();
    const heapAfterWarmup = takeHeapSnapshot();
    const leaveAfterWarmup = probe.leaveActive();
    const subscribeAfterWarmup = probe.subscribeActive();

    expect(leaveAfterWarmup).toBe(baselineLeave);

    for (let i = 0; i < 1000; i++) {
      const { unmount } = render(MountUnmountProbe, {
        props: { router },
      });

      unmount();
    }

    forceGC();
    const heapAfterMain = takeHeapSnapshot();

    // Active leave listeners must return to the same level after every cycle —
    // useRouteExit's onDestroy(off) releases the subscribeLeave callback. A
    // forgotten cleanup would leave 1000 dangling closures here.
    expect(probe.leaveActive()).toBe(leaveAfterWarmup);

    // router.subscribe is wired through @real-router/sources WeakMap cache;
    // the cache is keyed by router instance and stays alive as long as the
    // router does, so a small fixed number of subscriptions is expected and
    // must not grow per cycle.
    expect(probe.subscribeActive()).toBe(subscribeAfterWarmup);

    // 1000 mount/unmount cycles with no real work should not balloon the
    // heap. 50 MB is generous — a true listener leak would push this past
    // hundreds of MB on a 1000-cycle run.
    expect(heapAfterMain - heapAfterWarmup).toBeLessThan(50 * MB);

    probe.restore();
  });
});
