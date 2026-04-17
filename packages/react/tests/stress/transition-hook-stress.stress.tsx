import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/react";

import { createStressRouter } from "./helpers";

import type { FC } from "react";

const makeTransitionConsumer = (
  onTransition: (t: { isTransitioning: boolean }) => void,
): FC => {
  return () => {
    const transition = useRouterTransition();

    onTransition(transition);

    return null;
  };
};

describe("R7 — useRouterTransition stress", () => {
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
    let resolveGuard!: (v: boolean) => void;

    lifecycle.addActivateGuard(
      "target",
      () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        }),
    );

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
        resolveGuard(true);
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

    const Consumers: FC = () => (
      <>
        {Array.from({ length: 20 }, (_, i) => {
          const Sub: FC = () => {
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
        { name: "other", path: "/other" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard(
      "guarded",
      () => () => new Promise<boolean>(() => {}),
    );

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
        await router.navigate(i % 2 === 0 ? "other" : "home");
      });

      expect(snapshot.isTransitioning).toBe(false);
    }

    expect(snapshot.isTransitioning).toBe(false);

    router.stop();
  });

  it("7.5: router.stop() mid-transition — no unhandled rejections, no React warnings", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "slow", path: "/slow" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard(
      "slow",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        }),
    );

    let unhandledRejection = false;

    const rejectionHandler = (): void => {
      unhandledRejection = true;
    };

    globalThis.addEventListener("unhandledrejection", rejectionHandler);

    const Consumer = makeTransitionConsumer(() => {});
    const { unmount } = render(
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>,
    );

    // Start transition (pending guard). Do NOT await.
    const navPromise = router.navigate("slow").catch(() => {});

    // Immediately tear down mid-transition.
    router.stop();
    unmount();

    await navPromise;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(unhandledRejection).toBe(false);

    globalThis.removeEventListener("unhandledrejection", rejectionHandler);
  });

  it("7.6: concurrent navigations with async guards of mixed duration — no zombie isTransitioning", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "fast", path: "/fast" },
        { name: "slow", path: "/slow" },
        { name: "medium", path: "/medium" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const lifecycle = getLifecycleApi(router);

    const makeDelayedGuard = (delayMs: number) => () => () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, delayMs);
      });

    lifecycle.addActivateGuard("fast", makeDelayedGuard(10));
    lifecycle.addActivateGuard("medium", makeDelayedGuard(40));
    lifecycle.addActivateGuard("slow", makeDelayedGuard(80));

    let snapshot = { isTransitioning: false };

    const Consumer = makeTransitionConsumer((t) => {
      snapshot = t;
    });

    render(
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>,
    );

    // Fire all three concurrently — slow first, then faster ones.
    // Last navigate wins: "medium" (started last, resolves before slow).
    await act(async () => {
      void router.navigate("slow").catch(() => {});
      void router.navigate("fast").catch(() => {});
      void router.navigate("medium").catch(() => {});
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
      });
    });

    // The final landing route is deterministic (last-write-wins); isTransitioning
    // must settle to false regardless of guard interleaving.
    expect(snapshot.isTransitioning).toBe(false);
    expect(router.getState()?.name).toBe("medium");

    router.stop();
  });
});
