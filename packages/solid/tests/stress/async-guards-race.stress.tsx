import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/solid";

import type { RouterTransitionSnapshot } from "@real-router/solid";

/**
 * Audit section 7, scenario #5: concurrent navigate() calls with async guards
 * of DIFFERENT durations.
 *
 * Existing transition-hook-stress covers 50 concurrent identical guards. This
 * file complements that by pairing a slow guard against a fast one:
 *
 *   t0: navigate("slow")  → slow guard starts
 *   t1: navigate("fast")  → previous navigation aborted, fast guard starts
 *   t2: fast guard resolves → router lands on "fast"
 *   t3: slow guard resolves (too late) → router state does NOT revert
 *
 * If the slow guard's late completion leaks into state, the router would land
 * on the wrong route. The snapshot's `toRoute` must track the latest target.
 */
describe("S10 — async-guards race stress (Solid)", () => {
  it("10.1: fast navigate during slow guard — fast wins, slow late-resolve is ignored", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "slow", path: "/slow" },
        { name: "fast", path: "/fast" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    let resolveSlow!: (v: boolean) => void;
    let resolveFast!: (v: boolean) => void;

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("slow", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveSlow = resolve;
      });
    });
    lifecycle.addActivateGuard("fast", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveFast = resolve;
      });
    });

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      isLeaveApproved: false,
      toRoute: null,
      fromRoute: null,
    };

    function Consumer() {
      const transition = useRouterTransition();

      createEffect(() => {
        snapshot = transition();
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>
    ));

    const slowPromise = router.navigate("slow").catch(() => "slow-rejected");

    // Tick so the transition starts.
    await Promise.resolve();

    expect(snapshot.toRoute?.name).toBe("slow");

    const fastPromise = router.navigate("fast").catch(() => "fast-rejected");

    await Promise.resolve();

    // The later navigate supersedes the earlier one — toRoute now points at "fast".
    expect(snapshot.toRoute?.name).toBe("fast");

    resolveFast(true);

    await fastPromise;

    expect(router.getState()?.name).toBe("fast");

    // Slow guard now resolves — must NOT re-activate "slow". The router already
    // committed to "fast", so the late resolve is dropped.
    resolveSlow(true);
    await slowPromise;

    // Give FSM any queued microtasks a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(router.getState()?.name).toBe("fast");
    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });

  it("10.2: 20 concurrent navigations with mixed durations — final state is the last navigate", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        ...Array.from({ length: 20 }, (_, i) => ({
          name: `r${i}`,
          path: `/r${i}`,
        })),
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const resolvers = new Map<number, (v: boolean) => void>();

    const lifecycle = getLifecycleApi(router);

    for (let i = 0; i < 20; i++) {
      const index = i;

      lifecycle.addActivateGuard(`r${index}`, () => () => {
        return new Promise<boolean>((resolve) => {
          resolvers.set(index, resolve);
        });
      });
    }

    // Fire 20 navigations — each cancels the previous one.
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < 20; i++) {
      promises.push(router.navigate(`r${i}`).catch(() => null));
    }

    // Let the FSM process cancellations.
    await Promise.resolve();

    // Now resolve the LAST guard — the router should commit to r19.
    resolvers.get(19)?.(true);
    await Promise.resolve();

    // Resolve the earlier guards too — they should have no effect because
    // their navigations were already aborted.
    for (let i = 0; i < 19; i++) {
      resolvers.get(i)?.(true);
    }

    await Promise.all(promises);

    expect(router.getState()?.name).toBe("r19");

    router.stop();
  });
});
