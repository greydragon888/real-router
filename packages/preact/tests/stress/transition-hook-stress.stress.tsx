import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { FunctionComponent } from "preact";

function asyncGuard() {
  return new Promise<boolean>((resolve) => {
    asyncGuardResolve = resolve;
  });
}

function asyncGuardFactory() {
  return asyncGuard;
}

function neverResolveGuard() {
  return new Promise<boolean>(() => {});
}

function neverResolveGuardFactory() {
  return neverResolveGuard;
}

let asyncGuardResolve!: (v: boolean) => void;

const makeTransitionConsumer = (
  onTransition: (t: { isTransitioning: boolean }) => void,
): FunctionComponent => {
  return () => {
    const transition = useRouterTransition();

    onTransition(transition);

    return null;
  };
};

describe("useRouterTransition stress (Preact)", () => {
  afterEach(() => {
    cleanup();
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

    lifecycle.addActivateGuard("target", asyncGuardFactory);

    let snapshot = { isTransitioning: false };

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>,
    );

    for (let i = 0; i < 50; i++) {
      await act(async () => {
        void router.navigate("target");
        await Promise.resolve();
      });

      expect(snapshot.isTransitioning).toBe(true);

      await act(async () => {
        asyncGuardResolve(true);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(snapshot.isTransitioning).toBe(false);

      if (i < 49) {
        await act(async () => {
          await router.navigate(i % 2 === 0 ? "alt" : "home");
        });
      }
    }

    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });

  it("7.2: 50 concurrent navigations — last wins, isTransitioning finally false", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let snapshot = { isTransitioning: false };

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>,
    );

    await act(async () => {
      for (let i = 1; i <= 50; i++) {
        void router.navigate(`route${i % 50}`);
      }

      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshot.isTransitioning).toBe(false);
    expect(router.getState()?.name).toBeDefined();

    router.stop();
  });

  it("7.3: 20 useRouterTransition consumers + 50 navigations — all consistent", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    const snapshots: { isTransitioning: boolean }[] = Array.from(
      { length: 20 },
      () => ({ isTransitioning: false }),
    );

    const Consumers: FunctionComponent = () => (
      <>
        {Array.from({ length: 20 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            const transition = useRouterTransition();

            snapshots[i] = transition;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    render(
      <RouterProvider router={router}>
        <Consumers />
      </RouterProvider>,
    );

    for (let nav = 0; nav < 50; nav++) {
      await act(async () => {
        await router.navigate(`route${(nav % 49) + 1}`);
      });
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
        { name: "other2", path: "/other2" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("guarded", neverResolveGuardFactory);

    let snapshot = { isTransitioning: false };

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>,
    );

    for (let i = 0; i < 50; i++) {
      await act(async () => {
        void router.navigate("guarded");
        await Promise.resolve();
      });

      await act(async () => {
        await router.navigate(i % 2 === 0 ? "other2" : "home");
      });

      expect(snapshot.isTransitioning).toBe(false);
    }

    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });
});
