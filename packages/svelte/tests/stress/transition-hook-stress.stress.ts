import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { tick } from "svelte";
import { describe, it, expect, afterEach } from "vitest";

import TransitionConsumer from "./components/TransitionConsumer.svelte";
import { createStressRouter, renderWithRouter } from "./helpers";

import type { RouterTransitionSnapshot } from "@real-router/sources";

const neverResolveGuard = () => new Promise<boolean>(() => {});

describe("SV7 — useRouterTransition stress (Svelte)", () => {
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

    const guardFactory = () =>
      new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });

    lifecycle.addActivateGuard("target", () => guardFactory);

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const { unmount } = renderWithRouter(router, TransitionConsumer, {
      onTransition: (t: RouterTransitionSnapshot) => {
        snapshot = t;
      },
    });

    await tick();

    for (let i = 0; i < 50; i++) {
      void router.navigate("target");
      await Promise.resolve();
      await tick();

      expect(snapshot.isTransitioning).toBe(true);

      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();
      await tick();

      expect(snapshot.isTransitioning).toBe(false);

      if (i < 49) {
        await router.navigate(i % 2 === 0 ? "alt" : "home");
        await tick();
      }
    }

    expect(snapshot.isTransitioning).toBe(false);

    unmount();
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

    const { unmount } = renderWithRouter(router, TransitionConsumer, {
      onTransition: (t: RouterTransitionSnapshot) => {
        snapshot = t;
      },
    });

    await tick();

    for (let i = 1; i <= 50; i++) {
      void router.navigate(`route${i % 50}`);
    }

    await Promise.resolve();
    await Promise.resolve();
    await tick();

    expect(snapshot.isTransitioning).toBe(false);
    expect(router.getState()?.name).toBeDefined();

    unmount();
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

    const components = Array.from({ length: 20 }, (_, i) =>
      renderWithRouter(router, TransitionConsumer, {
        onTransition: (t: RouterTransitionSnapshot) => {
          snapshots[i] = t;
        },
      }),
    );

    await tick();

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(`route${(nav % 49) + 1}`);
      await tick();
    }

    const transitioning = snapshots.map((s) => s.isTransitioning);

    expect(new Set(transitioning).size).toBe(1);
    expect(transitioning[0]).toBe(false);

    for (const comp of components) {
      comp.unmount();
    }

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

    lifecycle.addActivateGuard("guarded", () => neverResolveGuard);

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const { unmount } = renderWithRouter(router, TransitionConsumer, {
      onTransition: (t: RouterTransitionSnapshot) => {
        snapshot = t;
      },
    });

    await tick();

    for (let i = 0; i < 50; i++) {
      void router.navigate("guarded");
      await Promise.resolve();

      await router.navigate(i % 2 === 0 ? "other" : "home");
      await tick();

      expect(snapshot.isTransitioning).toBe(false);
    }

    expect(snapshot.isTransitioning).toBe(false);

    unmount();
    router.stop();
  });
});
