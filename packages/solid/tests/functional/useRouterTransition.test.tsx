import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { render, screen, renderHook } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { createSignal, Show } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouterTransition } from "@real-router/solid";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

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
      wrapper: wrapper(router),
    });

    expect(result().isTransitioning).toBe(false);
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
      wrapper: wrapper(router),
    });

    void router.navigate("dashboard");
    await Promise.resolve();

    expect(result().isTransitioning).toBe(true);

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("isTransitioning === false upon TRANSITION_SUCCESS", async () => {
    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: wrapper(router),
    });

    await router.navigate("dashboard");

    expect(result().isTransitioning).toBe(false);
  });

  it("isTransitioning === false upon TRANSITION_ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: wrapper(router),
    });

    await router.navigate("dashboard").catch(() => {});

    expect(result().isTransitioning).toBe(false);
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
      wrapper: wrapper(router),
    });

    const p1 = router.navigate("dashboard");

    await Promise.resolve();

    const p2 = router.navigate("settings");

    resolveGuard(true);
    await p2;
    await p1.catch(() => {});

    expect(result().isTransitioning).toBe(false);
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
      wrapper: wrapper(router),
    });

    void router.navigate("dashboard");
    await Promise.resolve();

    expect(result().toRoute).not.toBeNull();
    expect(result().toRoute!.name).toBe("dashboard");

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
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
      wrapper: wrapper(router),
    });

    void router.navigate("dashboard");
    await Promise.resolve();

    expect(result().fromRoute).not.toBeNull();
    expect(result().fromRoute!.name).toBe("home");

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("toRoute and fromRoute === null when no transition", () => {
    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: wrapper(router),
    });

    expect(result().toRoute).toBeNull();
    expect(result().fromRoute).toBeNull();
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
      wrapper: wrapper(router),
    });

    let p1!: Promise<unknown>;

    p1 = router.navigate("dashboard");
    await Promise.resolve();

    expect(result().toRoute!.name).toBe("dashboard");

    const p2 = router.navigate("settings");

    await Promise.resolve();
    await Promise.resolve();

    resolveGuard(true);
    await p2;
    await p1.catch(() => {});

    expect(result().isTransitioning).toBe(false);
    expect(result().toRoute).toBeNull();
  });

  it("reports IDLE when mounted mid-transition (known limitation)", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    function TransitionDisplay() {
      const transition = useRouterTransition();

      return (
        <div data-testid="status">{String(transition().isTransitioning)}</div>
      );
    }

    function Wrapper() {
      const [show, setShow] = createSignal(false);

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
          <Show when={show()}>
            <TransitionDisplay />
          </Show>
        </>
      );
    }

    render(() => (
      <RouterProvider router={router}>
        <Wrapper />
      </RouterProvider>
    ));

    void router.navigate("dashboard");
    await Promise.resolve();

    fireEvent.click(screen.getByTestId("show"));

    expect(screen.getByTestId("status").textContent).toBe("false");

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("should set isLeaveApproved to true after deactivation guards pass", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: wrapper(router),
    });

    expect(result().isLeaveApproved).toBe(false);

    const navPromise = router.navigate("dashboard");

    await Promise.resolve();

    expect(result().isTransitioning).toBe(true);
    expect(result().isLeaveApproved).toBe(true);

    resolveGuard(true);
    await navPromise;

    expect(result().isTransitioning).toBe(false);
    expect(result().isLeaveApproved).toBe(false);
  });

  it("SSR: always returns IDLE_SNAPSHOT", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);

    const { result } = renderHook(() => useRouterTransition(), {
      wrapper: wrapper(freshRouter),
    });

    expect(result().isTransitioning).toBe(false);
    expect(result().toRoute).toBeNull();
    expect(result().fromRoute).toBeNull();
  });
});
