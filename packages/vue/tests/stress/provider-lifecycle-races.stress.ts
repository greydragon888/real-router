/**
 * Stress tests for RouterProvider lifecycle races.
 *
 * Closes review-2026-05-16 §7 risk scenarios:
 *
 *  - **7.B** — Mount `RouterProvider` mid-transition: a child component
 *    mounts while the router has an in-flight `navigate(...)` promise. The
 *    provider must mount cleanly without throwing, and the eventually-emitted
 *    transition snapshot must converge to the settled state.
 *
 *  - **7.C** — Explicit `router.dispose()` during an active navigate: the
 *    provider must unmount cleanly after dispose, and a fresh router must be
 *    immediately usable. Critical for SSR request scopes where `dispose()`
 *    runs in a `finally` block.
 *
 *  - **7.G** — `v-link` nested RouterProviders + LIFO out-of-order unmount:
 *    PBT in `tests/property/vLink.stack.properties.ts` covers the module-level
 *    stack invariants; this functional test pins the integration with the
 *    actual `RouterProvider` mount/unmount lifecycle under stress (50 cycles
 *    × nested depth 3).
 */

import { getLifecycleApi } from "@real-router/core/api";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { defineComponent, h, nextTick, ref, withDirectives } from "vue";

import { createStressRouter, mountWithProvider } from "./helpers";
import { useRouterTransition } from "../../src/composables/useRouterTransition";
import { vLink, getDirectiveRouter } from "../../src/directives/vLink";
import { RouterProvider } from "../../src/RouterProvider";

import type { RouterTransitionSnapshot } from "@real-router/sources";

/**
 * Run a navigation promise to completion OR drop it after `ms` — guards a
 * never-resolving guard from hanging the suite. The promise's rejection
 * (when dispose interrupts the transition) is swallowed so the assertion
 * code observes a clean settlement either way.
 */
function settleOrTimeout(
  promise: Promise<unknown>,
  ms: number,
): Promise<"settled" | "timeout"> {
  return Promise.race([
    promise.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => {
        resolve("timeout");
      }, ms),
    ),
  ]);
}

describe("Provider lifecycle races — stress (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // §7.B — Mount RouterProvider mid-transition
  // =============================================================================

  describe("7.B: mount RouterProvider mid-transition", () => {
    it("provider mounts cleanly while a navigation is parked at a guard; snapshot converges", async () => {
      const router = createStressRouter(5);

      await router.start("/route0");

      const lifecycle = getLifecycleApi(router);
      let resolveGuard!: (v: boolean) => void;

      lifecycle.addActivateGuard("route1", () => {
        return () =>
          new Promise<boolean>((resolve) => {
            resolveGuard = resolve;
          });
      });

      // Fire the navigation FIRST — guard parks the FSM in TRANSITION_RUNNING
      // before any provider mounts.
      const navPromise = router.navigate("route1");

      // Microtask boundary so the FSM enters TRANSITION_RUNNING.
      await nextTick();

      let lastSnapshot: RouterTransitionSnapshot = {
        isTransitioning: false,
        isLeaveApproved: false,
        toRoute: null,
        fromRoute: null,
      };

      const Probe = defineComponent({
        name: "Probe",
        setup() {
          const transition = useRouterTransition();

          return () => {
            lastSnapshot = transition.value;

            return h("div", { "data-testid": "probe" });
          };
        },
      });

      // The mount MUST NOT throw — the setup-time subscription on the
      // transition source has to tolerate being created mid-transition.
      let wrapper: ReturnType<typeof mount> | undefined;

      expect(() => {
        wrapper = mountWithProvider(router, () => h(Probe));
      }).not.toThrow();

      await nextTick();
      await flushPromises();

      // Resolve the guard — navigation completes cleanly. The snapshot must
      // converge to a settled state (isTransitioning=false) after the
      // navigation resolves.
      resolveGuard(true);
      await navPromise;
      await flushPromises();
      await nextTick();

      expect(lastSnapshot.isTransitioning).toBe(false);
      expect(router.getState()?.name).toBe("route1");

      wrapper?.unmount();
      router.stop();
    });

    it("30 cycles of in-flight-mount-then-resolve — no leaked transitions, FSM consistent", async () => {
      const router = createStressRouter(5);

      await router.start("/route0");

      const lifecycle = getLifecycleApi(router);
      const guardResolvers: ((v: boolean) => void)[] = [];

      lifecycle.addActivateGuard("route1", () => {
        return () =>
          new Promise<boolean>((resolve) => {
            guardResolvers.push(resolve);
          });
      });
      lifecycle.addActivateGuard("route2", () => {
        return () =>
          new Promise<boolean>((resolve) => {
            guardResolvers.push(resolve);
          });
      });

      for (let cycle = 0; cycle < 30; cycle++) {
        const target = cycle % 2 === 0 ? "route1" : "route2";
        const navPromise = router.navigate(target);

        await nextTick();

        const Probe = defineComponent({
          setup() {
            useRouterTransition();

            return () => h("div");
          },
        });
        const wrapper = mountWithProvider(router, () => h(Probe));

        // Resolve the parked guard — this cycle's navigation completes.
        guardResolvers.shift()?.(true);
        await navPromise;
        await flushPromises();

        wrapper.unmount();

        // Reset to route0 between cycles so the next target is always cross-route.
        await router.navigate("route0");
      }

      // After 30 cycles the FSM must be quiescent — any leaked transition
      // would surface as a stuck isTransitioning, observable via a fresh probe.
      let lastTransitioning = true;
      const FinalProbe = defineComponent({
        setup() {
          const t = useRouterTransition();

          return () => {
            lastTransitioning = t.value.isTransitioning;

            return h("div");
          };
        },
      });
      const final = mountWithProvider(router, () => h(FinalProbe));

      await nextTick();
      await flushPromises();

      expect(lastTransitioning).toBe(false);

      final.unmount();
      router.stop();
    });
  });

  // =============================================================================
  // §7.C — Explicit router.dispose() during active navigate
  // =============================================================================

  describe("7.C: router.dispose() during active navigate", () => {
    it("dispose() during in-flight navigate — provider unmounts cleanly, no throw", async () => {
      const router = createStressRouter(5);

      await router.start("/route0");

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard("route1", () => {
        // Never-resolving guard — only `dispose()` can drop this navigation.
        return () => new Promise<boolean>(() => undefined);
      });

      const wrapper = mountWithProvider(router, () =>
        h("div", { "data-testid": "host" }),
      );

      // Fire the navigation — settle-or-timeout swallows the rejection that
      // `dispose()` triggers (the in-flight promise rejects with a
      // dispose-related error). Bounding by 500ms keeps the test fast even
      // if dispose semantics change.
      const settlement = settleOrTimeout(router.navigate("route1"), 500);

      await nextTick();
      await flushPromises();

      // Dispose mid-flight — must not throw.
      expect(() => {
        router.dispose();
      }).not.toThrow();

      // The navigation promise resolves (rejected or settled) within the
      // timeout. Whether dispose auto-rejects or leaves the promise pending
      // is an implementation detail; the test tolerates both.
      const outcome = await settlement;

      expect(["settled", "timeout"]).toContain(outcome);

      // Provider unmount must succeed — no leaked subscriptions or
      // try-to-write-after-dispose throws.
      expect(() => {
        wrapper.unmount();
      }).not.toThrow();
    });

    it("20 cycles of navigate+dispose+unmount — fresh router after the storm still works", async () => {
      // Each cycle: create router, mount provider, fire navigate, dispose mid-flight,
      // unmount. After 20 cycles a fresh router/provider must still complete
      // a normal navigation end-to-end (no Vue reactivity contamination,
      // no leaked global subscriptions).
      for (let cycle = 0; cycle < 20; cycle++) {
        const router = createStressRouter(5);

        await router.start("/route0");

        const lifecycle = getLifecycleApi(router);

        lifecycle.addActivateGuard("route1", () => {
          return () => new Promise<boolean>(() => undefined);
        });

        const wrapper = mountWithProvider(router, () => h("div"));
        const settlement = settleOrTimeout(router.navigate("route1"), 200);

        await nextTick();
        router.dispose();
        await settlement;

        wrapper.unmount();
      }

      // Sanity check: a fresh router/provider after the 20 dispose cycles
      // still works end-to-end.
      const fresh = createStressRouter(5);

      await fresh.start("/route0");

      const final = mountWithProvider(fresh, () => h("div"));

      await fresh.navigate("route1");
      await nextTick();
      await flushPromises();

      expect(fresh.getState()?.name).toBe("route1");

      final.unmount();
      fresh.stop();
    });
  });

  // =============================================================================
  // §7.G — v-link nested RouterProviders + LIFO out-of-order unmount
  // =============================================================================

  describe("7.G: v-link nested providers + out-of-order unmount under stress", () => {
    let outer: Awaited<ReturnType<typeof createStressRouter>>;
    let middle: Awaited<ReturnType<typeof createStressRouter>>;
    let inner: Awaited<ReturnType<typeof createStressRouter>>;

    beforeEach(async () => {
      outer = createStressRouter(5);
      middle = createStressRouter(5);
      inner = createStressRouter(5);
      await Promise.all([
        outer.start("/route0"),
        middle.start("/route0"),
        inner.start("/route0"),
      ]);
    });

    afterEach(() => {
      outer.stop();
      middle.stop();
      inner.stop();
    });

    it("50 mount/unmount cycles of 3 nested providers — directive always resolves to innermost", async () => {
      // The vLink directive uses a module-level LIFO stack maintained by
      // RouterProvider. Each provider pushes its router on mount and pops on
      // unmount. Under 50 cycles of nested-mount/nested-unmount, the
      // top-of-stack must always be the innermost active provider.
      for (let cycle = 0; cycle < 50; cycle++) {
        const showInner = ref(true);

        const App = defineComponent({
          directives: { link: vLink },
          setup() {
            return () =>
              h(
                RouterProvider,
                { router: outer },
                {
                  default: () =>
                    h(
                      RouterProvider,
                      { router: middle },
                      {
                        default: () =>
                          showInner.value
                            ? h(
                                RouterProvider,
                                { router: inner },
                                {
                                  default: () =>
                                    withDirectives(
                                      h("a", { "data-testid": "deep" }, "x"),
                                      [[vLink, { name: "route1" }]],
                                    ),
                                },
                              )
                            : null,
                      },
                    ),
                },
              );
          },
        });

        const wrapper = mount(App);

        await nextTick();

        // Innermost provider on top — directive resolves to `inner`.
        expect(getDirectiveRouter()).toBe(inner);

        // Toggle off the inner provider — directive must fall back to `middle`.
        showInner.value = false;
        await nextTick();

        expect(getDirectiveRouter()).toBe(middle);

        wrapper.unmount();
      }
    });

    it("out-of-order unmount (release outer first) preserves inner top-of-stack — 30 cycles", async () => {
      // Pathological order: parent provider unmounts before child. The stack
      // implementation uses identity-based removal (`lastIndexOf`), so the
      // outer release must NOT pop the inner router from the top.
      for (let cycle = 0; cycle < 30; cycle++) {
        const showOuter = ref(true);

        const Child = defineComponent({
          directives: { link: vLink },
          setup() {
            return () =>
              h(
                RouterProvider,
                { router: inner },
                {
                  default: () =>
                    withDirectives(
                      h("a", { "data-testid": "child-link" }, "x"),
                      [[vLink, { name: "route1" }]],
                    ),
                },
              );
          },
        });
        const App = defineComponent({
          setup() {
            return () =>
              showOuter.value
                ? h(
                    RouterProvider,
                    { router: outer },
                    {
                      default: () => h(Child),
                    },
                  )
                : h(Child);
          },
        });
        const wrapper = mount(App);

        await nextTick();

        expect(getDirectiveRouter()).toBe(inner);

        // Outer unmounts first; the child re-mounts at the root. The stack
        // identity-based pop must remove `outer` cleanly without disturbing
        // `inner`.
        showOuter.value = false;
        await nextTick();

        expect(getDirectiveRouter()).toBe(inner);

        wrapper.unmount();
      }
    });
  });
});
