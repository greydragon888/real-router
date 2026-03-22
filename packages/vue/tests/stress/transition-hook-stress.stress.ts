import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { createStressRouter, mountWithProvider } from "./helpers";
import { useRouterTransition } from "../../src/composables/useRouterTransition";

import type { RouterTransitionSnapshot } from "@real-router/sources";

describe("V7 — useRouterTransition stress (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("7.1: 50 navigations with async guard — isTransitioning true→false each time", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "target", path: "/target" },
        { name: "alt", path: "/alt" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (v: boolean) => void;

    lifecycle.addActivateGuard("target", () => {
      return () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        });
    });

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const Consumer = defineComponent({
      name: "Consumer",
      setup() {
        const transition = useRouterTransition();

        return () => {
          snapshot = transition.value;

          return h("div");
        };
      },
    });

    mountWithProvider(router, () => h(Consumer));

    await nextTick();
    await flushPromises();

    for (let i = 0; i < 50; i++) {
      void router.navigate("target");
      await nextTick();
      await flushPromises();

      expect(snapshot.isTransitioning).toBe(true);

      resolveGuard(true);
      await nextTick();
      await flushPromises();

      expect(snapshot.isTransitioning).toBe(false);

      if (i < 49) {
        await router.navigate(i % 2 === 0 ? "alt" : "home");
        await nextTick();
        await flushPromises();
      }
    }

    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });

  it("7.2: 50 concurrent navigations — last wins, isTransitioning finally false", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const Consumer = defineComponent({
      name: "Consumer",
      setup() {
        const transition = useRouterTransition();

        return () => {
          snapshot = transition.value;

          return h("div");
        };
      },
    });

    mountWithProvider(router, () => h(Consumer));

    await nextTick();
    await flushPromises();

    for (let i = 1; i <= 50; i++) {
      void router.navigate(`route${i % 50}`);
    }

    await nextTick();
    await flushPromises();

    expect(snapshot.isTransitioning).toBe(false);
    expect(router.getState()?.name).toBeDefined();

    router.stop();
  });

  it("7.3: 20 useRouterTransition consumers + 50 navigations — all consistent", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    const snapshots: RouterTransitionSnapshot[] =
      Array.from<RouterTransitionSnapshot>({ length: 20 }).fill({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

    const subscribers = Array.from({ length: 20 }, (_, i) => {
      const index = i;

      return defineComponent({
        name: `TransSub${i}`,
        setup() {
          const transition = useRouterTransition();

          return () => {
            snapshots[index] = transition.value;

            return h("div");
          };
        },
      });
    });

    mountWithProvider(router, () =>
      subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    await nextTick();
    await flushPromises();

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(`route${(nav % 49) + 1}`);
      await nextTick();
      await flushPromises();
    }

    const transitioning = snapshots.map((s) => s.isTransitioning);

    expect(new Set(transitioning).size).toBe(1);
    expect(transitioning[0]).toBe(false);

    router.stop();
  });

  it("7.4: navigate + cancel pattern × 50 — isTransitioning never stuck", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "guarded", path: "/guarded" },
        { name: "other", path: "/other" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("guarded", () => {
      return () => new Promise<boolean>(() => {});
    });

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const Consumer = defineComponent({
      name: "Consumer",
      setup() {
        const transition = useRouterTransition();

        return () => {
          snapshot = transition.value;

          return h("div");
        };
      },
    });

    mountWithProvider(router, () => h(Consumer));

    await nextTick();
    await flushPromises();

    for (let i = 0; i < 50; i++) {
      void router.navigate("guarded");
      await nextTick();

      await router.navigate(i % 2 === 0 ? "other" : "home");
      await nextTick();
      await flushPromises();

      expect(snapshot.isTransitioning).toBe(false);
    }

    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });
});
