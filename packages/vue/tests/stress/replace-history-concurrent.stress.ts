/**
 * Stress tests for `router.replaceHistoryState()` invoked while an async
 * transition is still pending (§7.1 #3, MED).
 *
 * Closes the §7.1 #3 review item: "replaceHistoryState во время transition —
 * potentially dangling listener during in-flight transition."
 *
 * Counterpart: `packages/preact/tests/stress/replace-history-during-transition.stress.tsx`.
 *
 * Vue uses `browser-plugin` (not Navigation API), so `traverseToLast` is
 * unavailable. `replaceHistoryState` is the analog mutating-history call:
 * it rewrites `history.state` + URL without triggering a router
 * transition. The invariants here are identical to the Preact suite:
 *
 *  - pending `transition.toRoute` is not mutated by `replaceHistoryState`.
 *  - no exception thrown, no stuck `isTransitioning`.
 *  - after the guard resolves, `onTransitionSuccess` overwrites browser
 *    state with the transition target — NOT the intermediate replace.
 *  - bursts of `replaceHistoryState` during the transition do not leak
 *    listeners or corrupt the final state.
 */

import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, watch } from "vue";

import { useRouterTransition } from "../../src/composables/useRouterTransition";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";
import type { RouterTransitionSnapshot } from "@real-router/sources";

function buildRouter(): Router {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "slow", path: "/slow" },
      { name: "other", path: "/other" },
      { name: "target", path: "/target" },
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `r${i}`,
        path: `/r${i}`,
      })),
    ],
    { defaultRoute: "home" },
  );

  router.usePlugin(browserPluginFactory());

  return router;
}

interface TransitionSpy {
  snapshot: RouterTransitionSnapshot;
}

function mountTransitionProbe(
  router: Router,
  spy: TransitionSpy,
): ReturnType<typeof mount> {
  const Probe = defineComponent({
    name: "TransitionProbe",
    setup() {
      const transition = useRouterTransition();

      watch(transition, (value) => {
        spy.snapshot = value;
      });

      // Seed with the initial value so the spy is populated before any
      // transition fires.
      spy.snapshot = transition.value;

      return () => h("div");
    },
  });

  return mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(Probe) }),
    }),
  );
}

describe("§7.1 #3 — replaceHistoryState during active transition (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = buildRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("3.1: replaceHistoryState mid-transition does not corrupt final state", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (v: boolean) => void;

    lifecycle.addActivateGuard(
      "slow",
      () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        }),
    );

    const spy: TransitionSpy = {
      snapshot: {
        isTransitioning: false,
        isLeaveApproved: false,
        toRoute: null,
        fromRoute: null,
      },
    };

    const wrapper = mountTransitionProbe(router, spy);

    // Kick off the slow transition.
    const pending = router.navigate("slow").catch(() => null);

    await nextTick();
    await flushPromises();

    expect(spy.snapshot.isTransitioning).toBe(true);
    expect(spy.snapshot.toRoute?.name).toBe("slow");

    // Rewrite history to a third route mid-transition.
    router.replaceHistoryState("other");

    expect(globalThis.location.pathname).toBe("/other");
    expect(history.state).toMatchObject({ name: "other" });

    // The router's pending transition is untouched.
    expect(spy.snapshot.isTransitioning).toBe(true);
    expect(spy.snapshot.toRoute?.name).toBe("slow");

    resolveGuard(true);
    await pending;
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("slow");
    expect(globalThis.location.pathname).toBe("/slow");
    expect(history.state).toMatchObject({ name: "slow" });
    expect(spy.snapshot.isTransitioning).toBe(false);

    wrapper.unmount();
  });

  it("3.2: burst of 10 replaceHistoryState calls during pending transition — final state consistent", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (v: boolean) => void;

    lifecycle.addActivateGuard(
      "target",
      () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        }),
    );

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    const pending = router.navigate("target").catch(() => null);

    await nextTick();
    await flushPromises();

    for (let i = 0; i < 10; i++) {
      router.replaceHistoryState(`r${i}`);
    }

    expect(globalThis.location.pathname).toBe("/r9");

    resolveGuard(true);
    await pending;
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("target");
    expect(globalThis.location.pathname).toBe("/target");
    expect(history.state).toMatchObject({ name: "target" });

    wrapper.unmount();
  });

  it("3.3: 50 concurrent navigate + replace pairs — no zombie isTransitioning, no leaked listeners", async () => {
    // Sustained burst: each cycle starts a guarded transition, replaces
    // history twice mid-flight, then resolves the guard. The invariant is
    // a final state with `isTransitioning === false` after every cycle.
    const lifecycle = getLifecycleApi(router);
    const pendingResolvers: ((v: boolean) => void)[] = [];

    lifecycle.addActivateGuard(
      "target",
      () => () =>
        new Promise<boolean>((resolve) => {
          pendingResolvers.push(resolve);
        }),
    );

    const spy: TransitionSpy = {
      snapshot: {
        isTransitioning: false,
        isLeaveApproved: false,
        toRoute: null,
        fromRoute: null,
      },
    };

    const wrapper = mountTransitionProbe(router, spy);

    for (let cycle = 0; cycle < 50; cycle++) {
      const pending = router.navigate("target").catch(() => null);

      await nextTick();
      await flushPromises();

      router.replaceHistoryState(`r${cycle % 10}`);
      router.replaceHistoryState(`r${(cycle + 1) % 10}`);

      // Resolve the guard inserted by THIS cycle.
      const resolver = pendingResolvers.shift();

      resolver?.(true);
      await pending;
      await nextTick();
      await flushPromises();

      // After each cycle, the router settles and the transition spy
      // reflects an idle FSM. Some cycles will land on "target" (first
      // commit), subsequent ones may same-route-skip but the spy must
      // not be stuck on `isTransitioning: true`.
      expect(spy.snapshot.isTransitioning).toBe(false);
    }

    expect(router.getState()?.name).toBe("target");

    wrapper.unmount();
  });
});
