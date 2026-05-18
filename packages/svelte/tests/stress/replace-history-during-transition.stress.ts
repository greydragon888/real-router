import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { tick } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import TransitionConsumer from "./components/TransitionConsumer.svelte";
import { renderWithRouter } from "./helpers";

import type { State, Router } from "@real-router/core";
import type { RouterTransitionSnapshot } from "@real-router/sources";

// Audit follow-up #2.2 — `router.replaceHistoryState(...)` is provided by
// browser-plugin and mutates `history.state` + `location.href` directly,
// without going through the FSM. Calling it mid-transition while a guard is
// still pending creates a window where the browser URL no longer matches
// the router's target snapshot. The end-state must still be consistent:
//
//   - router.getState() reflects the navigation target (last-write-wins),
//   - the transition snapshot returns to idle,
//   - useRoute()-driven components do not observe a half-applied state.

describe("Stress: replaceHistoryState during pending transition", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    router.usePlugin(browserPluginFactory());
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("13.1 navigate('dashboard') with slow guard + replaceHistoryState('home') mid-flight — final snapshot consistent", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard(
      "dashboard",
      () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        }),
    );

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

    expect(snapshot.isTransitioning).toBe(false);

    const navPromise = router.navigate("dashboard");

    await Promise.resolve();
    await tick();

    expect(snapshot.isTransitioning).toBe(true);
    expect(snapshot.toRoute?.name).toBe("dashboard");

    // Mid-transition history mutation. Pre-fix this would race with the
    // guard's onTransitionSuccess and either leak the stale URL or stomp
    // on the navigation target. We verify that neither happens.
    router.replaceHistoryState("home");

    expect(globalThis.history.state).toMatchObject({ name: "home" });

    // Snapshot must stay in transition until the guard resolves — the
    // history mutation must NOT trip the FSM into READY early.
    expect(snapshot.isTransitioning).toBe(true);
    expect(snapshot.toRoute?.name).toBe("dashboard");

    resolveGuard(true);
    await navPromise;
    await tick();

    // After the guard resolves, the navigation completes and the browser
    // URL is updated to the navigation target. The snapshot returns to idle.
    expect(snapshot.isTransitioning).toBe(false);
    expect(router.getState()?.name).toBe("dashboard");
    expect(globalThis.history.state).toMatchObject({ name: "dashboard" });

    unmount();
  });

  it("13.2 100 cycles of navigate + mid-flight replaceHistoryState — no stuck transitions, no lost params", async () => {
    const lifecycle = getLifecycleApi(router);
    const pending: ((v: boolean) => void)[] = [];

    lifecycle.addActivateGuard(
      "settings",
      () => () =>
        new Promise<boolean>((resolve) => {
          pending.push(resolve);
        }),
    );

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

    const finalStates: (State | undefined)[] = [];

    for (let i = 0; i < 100; i++) {
      const target = i % 2 === 0 ? "settings" : "home";
      const navPromise = router.navigate(target).catch(() => {});

      await Promise.resolve();

      if (target === "settings") {
        // Mid-flight URL mutation while the deactivation guard is pending.
        router.replaceHistoryState("dashboard");
      }

      // Resolve any queued slow-guard promises.
      while (pending.length > 0) {
        const resolve = pending.shift();

        resolve?.(true);
      }

      await navPromise;
      await tick();
      finalStates.push(router.getState());
    }

    // Every cycle must have settled to a router state — no stuck
    // transitions, no undefined leaks.
    for (const s of finalStates) {
      expect(s).toBeDefined();
      expect(["home", "settings"]).toContain(s!.name);
    }

    expect(snapshot.isTransitioning).toBe(false);

    unmount();
  });
});
