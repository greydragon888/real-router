import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/solid";

import { createStressRouter } from "./helpers";

import type { RouterTransitionSnapshot } from "@real-router/solid";

function makeTransitionConsumer(
  onTransition: (t: RouterTransitionSnapshot) => void,
) {
  return function TransitionConsumer() {
    const transition = useRouterTransition();

    createEffect(() => {
      onTransition(transition());
    });

    return null;
  };
}

function createAsyncGuardFactory() {
  let resolveGuard!: (v: boolean) => void;

  function guardFactory() {
    return function guardHandler() {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    };
  }

  return { guardFactory, getResolveGuard: () => resolveGuard };
}

function neverResolvingGuard() {
  return function neverResolvingHandler() {
    return new Promise<boolean>(() => {});
  };
}

describe("S7 — useRouterTransition stress (Solid)", () => {
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
    const { guardFactory, getResolveGuard } = createAsyncGuardFactory();

    lifecycle.addActivateGuard("target", guardFactory);

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(() => (
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>
    ));

    for (let i = 0; i < 50; i++) {
      void router.navigate("target");
      await Promise.resolve();
      await Promise.resolve();

      expect(snapshot.isTransitioning).toBe(true);

      getResolveGuard()(true);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(snapshot.isTransitioning).toBe(false);

      if (i < 49) {
        await router.navigate(i % 2 === 0 ? "alt" : "home");
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

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(() => (
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>
    ));

    for (let i = 1; i <= 50; i++) {
      void router.navigate(`route${i % 50}`);
    }

    await Promise.resolve();
    await Promise.resolve();

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

    function Sub(props: { index: number }) {
      const transition = useRouterTransition();

      createEffect(() => {
        snapshots[props.index] = transition();
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 20 }, (_, i) => (
          <Sub index={i} />
        ))}
      </RouterProvider>
    ));

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(`route${(nav % 49) + 1}`);
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

    lifecycle.addActivateGuard("guarded", neverResolvingGuard);

    let snapshot: RouterTransitionSnapshot = {
      isTransitioning: false,
      toRoute: null,
      fromRoute: null,
    };

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(() => (
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>
    ));

    for (let i = 0; i < 50; i++) {
      void router.navigate("guarded");
      await Promise.resolve();

      await router.navigate(i % 2 === 0 ? "other" : "home");

      expect(snapshot.isTransitioning).toBe(false);
    }

    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });
});
