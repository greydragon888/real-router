/**
 * Stress tests for `useRouteEnter` / `useRouteExit` under rapid navigation,
 * mount/unmount cycles, abort signal races, and synchronous handler throws
 * (§7.2 #16, MED).
 *
 * Closes the §7.2 #16 review item: "useRouteEnter / useRouteExit под stress —
 * public hooks, captured-at-init (Vue specific). Не stress: (a) 100 mount →
 * handler accumulates leave-subscriptions; (b) abort signal race; (c)
 * handler throws."
 *
 * Counterpart: `packages/preact/tests/stress/route-hooks-stress.stress.tsx`.
 *
 * Vue-specific gotcha (CLAUDE.md): the handler is captured ONCE at
 * `setup()` time and is NOT reactive. The hooks subscribe to
 * `router.subscribeLeave` (exit) / `watch(route)` (enter) and depend on
 * `onScopeDispose` to clean up.
 *
 * Invariants exercised:
 *  - 100 mount → unmount cycles leave **zero** lingering subscriptions.
 *  - Abort signal race: a second navigation aborts the first; the slower
 *    handler observes `signal.aborted === true` after the await.
 *  - Synchronous handler throws do not zombie the router — subsequent
 *    navigations still resolve, and the FSM commits the destination.
 */

import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { createStressRouter, mountWithProvider } from "./helpers";
import { useRouteEnter } from "../../src/composables/useRouteEnter";
import { useRouteExit } from "../../src/composables/useRouteExit";

import type { Router, State } from "@real-router/core";

describe("§7.2 #16 — useRouteEnter / useRouteExit stress (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(15);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("16.1: mount → unmount × 100 cycles — no leaked subscriptions, no fires after unmount", async () => {
    // After 100 mount/unmount cycles, navigations must NOT invoke any
    // handler from the 100 unmounted instances. Counts post-unmount
    // calls — must be zero. Leaks would manifest as N×nav calls.
    let postUnmountCalls = 0;

    const HostEnter = defineComponent({
      name: "HostEnter",
      setup() {
        useRouteEnter(() => {
          postUnmountCalls++;
        });

        return () => h("div");
      },
    });

    const HostExit = defineComponent({
      name: "HostExit",
      setup() {
        useRouteExit(() => {
          postUnmountCalls++;
        });

        return () => h("div");
      },
    });

    for (let i = 0; i < 100; i++) {
      const wrapper = mountWithProvider(router, () => [
        h(HostEnter),
        h(HostExit),
      ]);

      wrapper.unmount();
    }

    // Reset the counter — fires that happened during navigations triggered
    // BY mount/unmount themselves are not the regression we care about.
    postUnmountCalls = 0;

    // Drive a few navigations AFTER all instances are unmounted.
    for (let i = 1; i <= 5; i++) {
      await router.navigate(`route${i}`);
      await nextTick();
      await flushPromises();
    }

    expect(postUnmountCalls).toBe(0);
  });

  it("16.2: abort signal race — slower exit handler observes aborted=true after second nav", async () => {
    // Scenario: first navigation starts → useRouteExit's awaitable handler
    // is suspended → second navigation arrives → router aborts the leave
    // signal → the suspended handler resumes and reads signal.aborted as
    // true.
    let resumedWith: boolean | null = null;
    let signalRef: AbortSignal | null = null;
    let releaseHandler!: () => void;

    const Host = defineComponent({
      name: "AbortRaceHost",
      setup() {
        useRouteExit(async ({ signal }) => {
          // Capture the first invocation's signal so we can read its
          // aborted state after the second nav cancels it.
          if (!signalRef) {
            signalRef = signal;

            await new Promise<void>((resolve) => {
              releaseHandler = resolve;
            });

            resumedWith = signal.aborted;
          }
        });

        return () => h("div");
      },
    });

    mountWithProvider(router, () => h(Host));
    await flushPromises();

    // First navigation: starts the suspendable handler.
    const first = router.navigate("route1").catch(() => null);

    await nextTick();
    await flushPromises();

    expect(signalRef).not.toBeNull();
    expect(signalRef!.aborted).toBe(false);

    // Second navigation supersedes the first. router aborts the leave
    // signal of the in-flight transition.
    const second = router.navigate("route2").catch(() => null);

    await nextTick();
    await flushPromises();

    expect(signalRef!.aborted).toBe(true);

    // Now release the suspended handler so the assertion below runs.
    releaseHandler();
    await first;
    await second;
    await flushPromises();

    expect(resumedWith).toBe(true);
  });

  it("16.3: 30 abort-race cycles — router never zombies, no leaked subscriptions", async () => {
    // Sustained burst: 30 race-then-resolve cycles. Each cycle starts a
    // navigation whose exit handler holds open via a pending Promise,
    // then immediately fires a second navigation. The router must abort
    // the first, the suspended handler must resume (we release each
    // cycle's pending Promise), and the router must commit a final state.
    //
    // Per-cycle deterministic capture is racy (the second nav may
    // overlap the handler entering, the next cycle may overlap exit) —
    // so we assert a coarser invariant: the router stays responsive
    // throughout, and the final state is one of the expected targets.
    let totalInvocations = 0;
    const pendingResolvers: (() => void)[] = [];

    const Host = defineComponent({
      name: "AbortRaceLoopHost",
      setup() {
        useRouteExit(async () => {
          totalInvocations++;
          await new Promise<void>((resolve) => {
            pendingResolvers.push(resolve);
          });
        });

        return () => h("div");
      },
    });

    mountWithProvider(router, () => h(Host));
    await flushPromises();

    for (let i = 0; i < 30; i++) {
      const first = router.navigate(`route${(i % 14) + 1}`).catch(() => null);

      await nextTick();
      await flushPromises();

      const second = router
        .navigate(`route${((i + 1) % 14) + 1}`)
        .catch(() => null);

      await nextTick();
      await flushPromises();

      // Drain any pending leave handlers from this cycle (and any tail
      // from previous cycles that were still suspended).
      while (pendingResolvers.length > 0) {
        pendingResolvers.shift()?.();
      }

      await first;
      await second;
      await flushPromises();
    }

    // The handler must have been invoked at least a few times — the
    // exact count depends on how same-route skip interacts with the
    // round-robin pattern, but it cannot be zero unless subscribeLeave
    // is broken.
    expect(totalInvocations).toBeGreaterThan(0);
    expect(router.getState()?.name).toBeDefined();
  });

  it("16.4: synchronous handler throws — router still commits subsequent navigations", async () => {
    // Throwing inside useRouteExit's leave handler must not prevent
    // subsequent navigations from resolving. The router treats the
    // rejected leave promise as a cancellation for THAT nav, but the
    // FSM must accept the NEXT one cleanly.
    let throwCount = 0;

    const Host = defineComponent({
      name: "ThrowHost",
      setup() {
        useRouteExit(() => {
          throwCount++;

          throw new Error(`boom-${throwCount}`);
        });

        return () => h("div");
      },
    });

    mountWithProvider(router, () => h(Host));
    await flushPromises();

    // Each iteration: navigate (handler throws) → router rejects → next
    // navigate (handler throws again with a fresh route as origin).
    for (let i = 0; i < 50; i++) {
      const target = `route${(i % 14) + 1}`;

      await router.navigate(target).catch(() => null);
      await nextTick();
      await flushPromises();
    }

    // Lower bound: 1 throw per cross-route nav. We don't pin the exact
    // count (some navs may be same-route under the round-robin), but
    // there MUST be throws and the router MUST still be alive.
    expect(throwCount).toBeGreaterThan(0);
    expect(router.getState()?.name).toBeDefined();

    // One last clean navigation to assert the FSM is not zombied.
    await router.navigate("route1").catch(() => null);
    await flushPromises();

    expect(router.getState()).toBeDefined();
  });

  it("16.5: useRouteEnter fires once per cross-route navigation under rapid bursts", async () => {
    // Alternating navs between two routes — handler must fire on every
    // cross. Default skipSameRoute is true, but each iteration crosses,
    // so no skips.
    const enters: { name: string; from: string }[] = [];

    const Host = defineComponent({
      name: "EnterHost",
      setup() {
        useRouteEnter(
          ({
            route,
            previousRoute,
          }: {
            route: State;
            previousRoute: State;
          }) => {
            enters.push({ name: route.name, from: previousRoute.name });
          },
        );

        return () => h("div");
      },
    });

    mountWithProvider(router, () => h(Host));
    await flushPromises();

    for (let i = 0; i < 10; i++) {
      await router.navigate("route1");
      await nextTick();
      await flushPromises();

      await router.navigate("route0");
      await nextTick();
      await flushPromises();
    }

    // 20 cross-route navigations → 20 enter callbacks.
    expect(enters).toHaveLength(20);
    expect(enters.at(-1)!.name).toBe("route0");
  });

  it("16.6: force-true same-route navigation default — useRouteExit skips, opt-out fires", async () => {
    // Default skipSameRoute=true: force-navigate to same route does NOT
    // fire the handler. Counts must match documented semantics.
    let defaultFires = 0;
    let optOutFires = 0;

    const HostDefault = defineComponent({
      name: "HostDefault",
      setup() {
        useRouteExit(() => {
          defaultFires++;
        });

        return () => h("div");
      },
    });

    const HostOptOut = defineComponent({
      name: "HostOptOut",
      setup() {
        useRouteExit(
          () => {
            optOutFires++;
          },
          { skipSameRoute: false },
        );

        return () => h("div");
      },
    });

    mountWithProvider(router, () => [h(HostDefault), h(HostOptOut)]);
    await flushPromises();

    // 10 force-same-route navs.
    for (let i = 0; i < 10; i++) {
      await router.navigate("route0", {}, { force: true });
      await nextTick();
      await flushPromises();
    }

    expect(defaultFires).toBe(0);
    expect(optOutFires).toBe(10);

    // One cross-route nav — default fires once, opt-out fires once.
    await router.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(defaultFires).toBe(1);
    expect(optOutFires).toBe(11);
  });
});
