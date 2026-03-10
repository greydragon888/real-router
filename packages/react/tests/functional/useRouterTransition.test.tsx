import { createRouter, getLifecycleApi } from "@real-router/core";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "@real-router/react";

import { useRouterTransition } from "../../src/hooks/useRouterTransition";

import type { Router } from "@real-router/core";
import type { FC, PropsWithChildren } from "react";

const wrapper: FC<PropsWithChildren<{ router: Router }>> = ({
  children,
  router,
}) => <RouterProvider router={router}>{children}</RouterProvider>;

describe("useRouterTransition", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("isTransitioning === false initially", () => {
    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current.isTransitioning).toBe(false);
  });

  it("isTransitioning === true upon TRANSITION_START", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      void router.navigate("dashboard");
      await Promise.resolve();
    });

    expect(result.current.isTransitioning).toBe(true);

    await act(async () => {
      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("isTransitioning === false upon TRANSITION_SUCCESS", async () => {
    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      await router.navigate("dashboard");
    });

    expect(result.current.isTransitioning).toBe(false);
  });

  it("isTransitioning === false upon TRANSITION_ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      await router.navigate("dashboard").catch(() => {});
    });

    expect(result.current.isTransitioning).toBe(false);
  });

  it("isTransitioning === false upon TRANSITION_CANCEL", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      const p1 = router.navigate("dashboard");

      await Promise.resolve();

      const p2 = router.navigate("settings");

      resolveGuard(true);
      await p2;
      await p1.catch(() => {});
    });

    expect(result.current.isTransitioning).toBe(false);
  });

  it("toRoute contains target state during transition", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      void router.navigate("dashboard");
      await Promise.resolve();
    });

    expect(result.current.toRoute).not.toBeNull();
    expect(result.current.toRoute!.name).toBe("dashboard");

    await act(async () => {
      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("fromRoute contains source state during transition", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      void router.navigate("dashboard");
      await Promise.resolve();
    });

    expect(result.current.fromRoute).not.toBeNull();
    expect(result.current.fromRoute!.name).toBe("home");

    await act(async () => {
      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("toRoute and fromRoute === null when no transition", () => {
    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current.toRoute).toBeNull();
    expect(result.current.fromRoute).toBeNull();
  });

  it("handles cancel by new navigate correctly", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      const p1 = router.navigate("dashboard");

      await Promise.resolve();

      expect(result.current.toRoute!.name).toBe("dashboard");

      const p2 = router.navigate("settings");

      await Promise.resolve();
      await Promise.resolve();

      resolveGuard(true);
      await p2;
      await p1.catch(() => {});
    });

    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.toRoute).toBeNull();
  });

  // Known limitation: TransitionSource subscribes to events on creation,
  // so it misses TRANSITION_START that already fired before mount.
  // Fixing this would require an `isTransitioning()` getter in PluginApi (core),
  // which is not justified for this synthetic edge case.
  it("reports IDLE when mounted mid-transition (known limitation)", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    function TransitionDisplay(): React.JSX.Element {
      const { isTransitioning } = useRouterTransition();

      return <div data-testid="status">{String(isTransitioning)}</div>;
    }

    function Wrapper(): React.JSX.Element {
      const [show, setShow] = useState(false);

      return (
        <>
          <button
            data-testid="show"
            onClick={() => {
              setShow(true);
            }}
          >
            Show
          </button>
          {show && <TransitionDisplay />}
        </>
      );
    }

    render(
      <RouterProvider router={router}>
        <Wrapper />
      </RouterProvider>,
    );

    // 1. Start navigation → TRANSITION_START fires
    await act(async () => {
      void router.navigate("dashboard");
      await Promise.resolve();
    });

    // 2. Mount TransitionDisplay mid-transition
    fireEvent.click(screen.getByTestId("show"));

    // 3. Source was created with IDLE_SNAPSHOT, START already fired
    //    → isTransitioning is false (source missed the event)
    expect(screen.getByTestId("status").textContent).toBe("false");

    // Cleanup: resolve guard to avoid dangling promises
    await act(async () => {
      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("SSR: always returns IDLE_SNAPSHOT", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: (props) => wrapper({ ...props, router: freshRouter }),
    });

    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.toRoute).toBeNull();
    expect(result.current.fromRoute).toBeNull();
  });
});
