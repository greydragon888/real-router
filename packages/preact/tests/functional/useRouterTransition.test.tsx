import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/preact";
import { useState } from "preact/hooks";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { useRouterTransition } from "../../src/hooks/useRouterTransition";

import type { Router } from "@real-router/core";
import type { FunctionComponent, VNode } from "preact";

const wrapper: FunctionComponent<{ router: Router }> = ({
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

    let p1!: Promise<unknown>;

    await act(async () => {
      p1 = router.navigate("dashboard");
      await Promise.resolve();
    });

    expect(result.current.toRoute!.name).toBe("dashboard");

    await act(async () => {
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

  it("reports IDLE when mounted mid-transition (known limitation)", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    function TransitionDisplay(): VNode {
      const { isTransitioning } = useRouterTransition();

      return <div data-testid="status">{String(isTransitioning)}</div>;
    }

    function Wrapper(): VNode {
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

    await act(async () => {
      void router.navigate("dashboard");
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId("show"));

    expect(screen.getByTestId("status").textContent).toBe("false");

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
