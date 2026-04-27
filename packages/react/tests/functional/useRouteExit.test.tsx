import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider, useRouteExit } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { RouteExitHandler, UseRouteExitOptions } from "@real-router/react";
import type { JSX } from "react";

function Probe({
  handler,
  options,
}: Readonly<{
  handler: RouteExitHandler;
  options?: UseRouteExitOptions;
}>): JSX.Element {
  useRouteExit(handler, options);

  return <div data-testid="probe" />;
}

describe("useRouteExit", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("invokes the handler on cross-route navigation", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("test");
    expect(ctx.nextRoute.name).toBe("about");
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    // Navigating to the same route name with different params is same-route.
    // For the test router, navigating /users/list → /users/view changes
    // route name (users.list → users.view) — that's cross-route.
    // To get same-route, we navigate to "users.list" twice with different
    // params; but the second navigation will reject as SAME_STATES if
    // identical. Use ?q= query to differ.
    await act(async () => {
      await router.navigate("users.view", { id: "1" });
    });
    handler.mockClear();

    await act(async () => {
      await router.navigate("users.view", { id: "1", q: "x" });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} options={{ skipSameRoute: false }} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("users.view", { id: "1" });
    });
    handler.mockClear();

    await act(async () => {
      await router.navigate("users.view", { id: "1", q: "x" });
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("blocks navigation until the returned Promise resolves", async () => {
    let resolveExit!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const handler = vi.fn(() => exitPromise);

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    let navigated = false;
    const navigation = act(async () => {
      await router.navigate("about");
      navigated = true;
    });

    // Wait microtask — handler should be called but navigation pending.
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(navigated).toBe(false);

    resolveExit();
    await navigation;

    expect(navigated).toBe(true);
  });

  it("uses the latest handler reference without resubscribing", async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const { rerender } = render(
      <RouterProvider router={router}>
        <Probe handler={handlerA} />
      </RouterProvider>,
    );

    rerender(
      <RouterProvider router={router}>
        <Probe handler={handlerB} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", async () => {
    const handler = vi.fn();

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    unmount();

    await act(async () => {
      await router.navigate("about");
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("provides AbortSignal context to the handler", async () => {
    let receivedSignal: AbortSignal | undefined;
    const handler = vi.fn(({ signal }) => {
      receivedSignal = signal;
    });

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("about");
    });

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    // Signal is not aborted while the handler runs against an active leave.
    expect(receivedSignal?.aborted).toBe(false);
  });

  it("skips the handler when signal is already aborted (reentrant abort)", async () => {
    // Stub the router with a controllable subscribeLeave so we can inject
    // a pre-aborted signal — exercises the early-return branch that's
    // hard to reproduce via real navigation timing.
    const handler = vi.fn();
    const leaveListeners: ((payload: {
      route: { name: string };
      nextRoute: { name: string };
      signal: AbortSignal;
    }) => void)[] = [];

    const fakeRouter = Object.create(router) as Router;

    Object.assign(fakeRouter, {
      subscribeLeave(
        listener: (payload: {
          route: { name: string };
          nextRoute: { name: string };
          signal: AbortSignal;
        }) => void,
      ) {
        leaveListeners.push(listener);

        return () => {
          const index = leaveListeners.indexOf(listener);

          if (index !== -1) {
            leaveListeners.splice(index, 1);
          }
        };
      },
    });

    render(
      <RouterProvider router={fakeRouter}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    // Pre-aborted signal — simulates rapid-navigation-superseded case.
    const controller = new AbortController();

    controller.abort();

    for (const listener of leaveListeners) {
      listener({
        route: { name: "test" },
        nextRoute: { name: "about" },
        signal: controller.signal,
      });
    }

    expect(handler).not.toHaveBeenCalled();
  });
});
