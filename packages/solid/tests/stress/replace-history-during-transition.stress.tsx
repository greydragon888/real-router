import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/solid";

import type { RouterTransitionSnapshot } from "@real-router/solid";

/**
 * Audit section 7, scenario #3: `router.replaceHistoryState()` invoked while an
 * async transition is still in flight.
 *
 * `browser-plugin` exposes `replaceHistoryState(name, params)` which mutates
 * `history.state` + the URL without triggering a transition. The concern: if
 * an async guard is pending, does a concurrent replaceHistoryState corrupt
 * either the pending transition's target state or the browser state after the
 * transition completes?
 *
 * Expected behaviour:
 *   - During the pending transition, replaceHistoryState rewrites the URL/state
 *     to a different route.
 *   - When the guard resolves, the router completes the transition and
 *     `onTransitionSuccess` overwrites the URL again with the transition
 *     target. The router state and browser state both reflect the transition
 *     target, NOT the intermediate replace.
 *   - No stuck `isTransitioning`, no exceptions thrown.
 */
describe("S11 — replaceHistoryState during active transition (Solid)", () => {
  it("11.1: replaceHistoryState mid-transition does not corrupt final state", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "slow", path: "/slow" },
        { name: "other", path: "/other" },
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(browserPluginFactory());

    await router.start("/");

    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (v: boolean) => void;

    lifecycle.addActivateGuard("slow", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      isLeaveApproved: false,
      toRoute: null,
      fromRoute: null,
    };

    function TransitionProbe() {
      const transition = useRouterTransition();

      createEffect(() => {
        snapshot = transition();
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        <TransitionProbe />
      </RouterProvider>
    ));

    // Kick off the slow transition — guard is pending.
    const pending = router.navigate("slow").catch(() => null);

    // Tick so the transition enters TRANSITION_STARTED.
    await Promise.resolve();

    expect(snapshot.isTransitioning).toBe(true);
    expect(snapshot.toRoute?.name).toBe("slow");

    // Now rewrite history to a third route while the transition is pending.
    router.replaceHistoryState("other");

    expect(globalThis.location.pathname).toBe("/other");
    expect(history.state).toMatchObject({ name: "other" });

    // The router itself is still mid-transition to "slow" — replaceHistoryState
    // does NOT abort the pending navigation.
    expect(snapshot.isTransitioning).toBe(true);
    expect(snapshot.toRoute?.name).toBe("slow");

    // Release the guard and let the transition complete.
    resolveGuard(true);
    await pending;

    // After completion:
    //   - router.state reflects the transition target ("slow")
    //   - history.state and URL also reflect "slow" (onTransitionSuccess wins)
    expect(router.getState()?.name).toBe("slow");
    expect(globalThis.location.pathname).toBe("/slow");
    expect(history.state).toMatchObject({ name: "slow" });
    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });

  it("11.2: N pending transitions × replaceHistoryState burst — no exceptions, final state consistent", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "target", path: "/target" },
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `r${i}`,
          path: `/r${i}`,
        })),
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(browserPluginFactory());

    await router.start("/");

    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (v: boolean) => void;

    lifecycle.addActivateGuard("target", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    render(() => <RouterProvider router={router}>{null}</RouterProvider>);

    const pending = router.navigate("target").catch(() => null);

    await Promise.resolve();

    // Burst of replaceHistoryState calls during the pending transition.
    for (let i = 0; i < 10; i++) {
      router.replaceHistoryState(`r${i}`);
    }

    expect(globalThis.location.pathname).toBe("/r9");

    resolveGuard(true);
    await pending;

    // After transition completes, browser state matches the transition target.
    expect(router.getState()?.name).toBe("target");
    expect(globalThis.location.pathname).toBe("/target");
    expect(history.state).toMatchObject({ name: "target" });

    router.stop();
  });
});
