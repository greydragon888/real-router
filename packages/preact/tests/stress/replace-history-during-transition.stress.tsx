import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { act, render } from "@testing-library/preact";
import { useEffect } from "preact/hooks";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/preact";

import type { RouterTransitionSnapshot } from "@real-router/preact";
import type { FunctionComponent } from "preact";

/**
 * Audit section 7, scenario #3: `router.replaceHistoryState()` invoked while
 * an async transition is still pending.
 *
 * Invariants:
 *  - pending transition.toRoute is not mutated by replaceHistoryState
 *  - no exception thrown, no stuck `isTransitioning`
 *  - after guard resolves, onTransitionSuccess overwrites browser state with
 *    the transition target (not the intermediate replace)
 */
describe("preact — replaceHistoryState during active transition", () => {
  it("replaceHistoryState mid-transition does not corrupt final state", async () => {
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

    const TransitionProbe: FunctionComponent = () => {
      const transition = useRouterTransition();

      useEffect(() => {
        snapshot = transition;
      }, [transition]);

      return null;
    };

    render(
      <RouterProvider router={router}>
        <TransitionProbe />
      </RouterProvider>,
    );

    let pending!: Promise<unknown>;

    // Kick off the slow transition inside act() so Preact flushes the
    // useEffect that captures the first isTransitioning snapshot.
    await act(async () => {
      pending = router.navigate("slow").catch(() => null);
      // Let TRANSITION_STARTED + probe effect run.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshot.isTransitioning).toBe(true);
    expect(snapshot.toRoute?.name).toBe("slow");

    // Rewrite history to a third route mid-transition.
    router.replaceHistoryState("other");

    expect(globalThis.location.pathname).toBe("/other");
    expect(history.state).toMatchObject({ name: "other" });

    // The router's pending transition is untouched.
    expect(snapshot.isTransitioning).toBe(true);
    expect(snapshot.toRoute?.name).toBe("slow");

    await act(async () => {
      resolveGuard(true);
      await pending;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(router.getState()?.name).toBe("slow");
    expect(globalThis.location.pathname).toBe("/slow");
    expect(history.state).toMatchObject({ name: "slow" });
    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });

  it("burst of replaceHistoryState calls during pending transition — final state consistent", async () => {
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

    render(<RouterProvider router={router}>{null}</RouterProvider>);

    const pending = router.navigate("target").catch(() => null);

    await Promise.resolve();

    for (let i = 0; i < 10; i++) {
      router.replaceHistoryState(`r${i}`);
    }

    expect(globalThis.location.pathname).toBe("/r9");

    resolveGuard(true);
    await pending;

    expect(router.getState()?.name).toBe("target");
    expect(globalThis.location.pathname).toBe("/target");
    expect(history.state).toMatchObject({ name: "target" });

    router.stop();
  });
});
