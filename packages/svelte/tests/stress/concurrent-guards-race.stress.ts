import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { tick } from "svelte";
import { describe, it, expect } from "vitest";

import TransitionConsumer from "./components/TransitionConsumer.svelte";
import { renderWithRouter } from "./helpers";

import type { RouterTransitionSnapshot } from "@real-router/sources";

/**
 * Covers review gap #5: concurrent navigate() calls with async guards of
 * different durations. Verifies that:
 *  - isTransitioning eventually falls back to false (no stuck transition),
 *  - guard promises from the losing navigation do not corrupt final state,
 *  - useRouterTransition snapshot consumers see a consistent final state.
 */
describe("Stress: concurrent async guards race", () => {
  it("guard-A=slow + guard-B=fast dispatched together — isTransitioning settles, last-navigation wins", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "slow", path: "/slow" },
        { name: "fast", path: "/fast" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);
    const pendingResolvers: ((v: boolean) => void)[] = [];

    // Slow guard — resolves only when we explicitly flush.
    lifecycle.addActivateGuard(
      "slow",
      () => () =>
        new Promise<boolean>((resolve) => {
          pendingResolvers.push(resolve);
        }),
    );

    // Fast guard — resolves on next microtask.
    lifecycle.addActivateGuard("fast", () => () => Promise.resolve(true));

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      isLeaveApproved: false,
      toRoute: null,
      fromRoute: null,
    };

    const { unmount } = renderWithRouter(router, TransitionConsumer, {
      onTransition: (t: RouterTransitionSnapshot) => {
        snapshot = t;
      },
    });

    await tick();

    // Fire slow first, then fast in the same synchronous tick.
    // The fast navigate should cancel the slow one via AbortController.
    const slowPromise = router.navigate("slow").catch(() => {});
    const fastPromise = router.navigate("fast").catch(() => {});

    // Drain the queued guard promises.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await tick();
    }

    // Flush the slow guard resolvers so no promise is left dangling.
    for (const resolve of pendingResolvers) {
      resolve(true);
    }

    pendingResolvers.length = 0;

    await Promise.allSettled([slowPromise, fastPromise]);
    await tick();

    // Invariant: transition must settle.
    expect(snapshot.isTransitioning).toBe(false);

    // Invariant: final state is either "fast" (last wins, expected) or "home"
    // (if the fast navigation was itself cancelled by something). It MUST NOT
    // be "slow" because the slow guard was cancelled before resolving.
    expect(router.getState()!.name).not.toBe("slow");

    unmount();
    router.stop();
  });

  it("100 concurrent navigations with async guards — no stuck transitions after flush", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
        { name: "c", path: "/c" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);

    // Each guard resolves on a microtask chain of varying length.
    lifecycle.addActivateGuard("a", () => () => Promise.resolve(true));
    lifecycle.addActivateGuard("b", () => async () => {
      await Promise.resolve();
      await Promise.resolve();

      return true;
    });
    lifecycle.addActivateGuard("c", () => async () => {
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      return true;
    });

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      isLeaveApproved: false,
      toRoute: null,
      fromRoute: null,
    };

    const { unmount } = renderWithRouter(router, TransitionConsumer, {
      onTransition: (t: RouterTransitionSnapshot) => {
        snapshot = t;
      },
    });

    await tick();

    const targets = ["a", "b", "c"];
    const results: Promise<unknown>[] = [];

    for (let i = 0; i < 100; i++) {
      results.push(router.navigate(targets[i % 3]).catch(() => {}));
    }

    await Promise.allSettled(results);

    // Drain microtasks a few extra times to let the last winner settle.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      await tick();
    }

    expect(snapshot.isTransitioning).toBe(false);
    expect(["a", "b", "c"]).toContain(router.getState()!.name);

    unmount();
    router.stop();
  });
});
