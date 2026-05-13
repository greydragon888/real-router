import { act, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider, useRouteExit } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type {
  RouteExitHandler,
  UseRouteExitOptions,
} from "@real-router/preact";
import type { JSX } from "preact";

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

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
  });

  it("skips the handler when signal is already aborted (reentrant abort)", async () => {
    // Stub the router with a controllable subscribeLeave so we can inject
    // a pre-aborted signal — exercises the early-return branch that's
    // hard to reproduce via real navigation timing.
    const handler = vi.fn();
    const leaveListeners: Parameters<Router["subscribeLeave"]>[0][] = [];

    vi.spyOn(router, "subscribeLeave").mockImplementation((listener) => {
      leaveListeners.push(listener);

      return () => {
        const index = leaveListeners.indexOf(listener);

        if (index !== -1) {
          leaveListeners.splice(index, 1);
        }
      };
    });

    render(
      <RouterProvider router={router}>
        <Probe handler={handler} />
      </RouterProvider>,
    );

    const controller = new AbortController();

    controller.abort();

    for (const listener of leaveListeners) {
      void listener({
        // @ts-expect-error -- simplified stub: LeaveState requires full State<Params>; only signal.aborted matters here
        route: { name: "test" },
        // @ts-expect-error -- simplified stub: LeaveState requires full State<Params>
        nextRoute: { name: "about" },
        signal: controller.signal,
      });
    }

    expect(handler).not.toHaveBeenCalled();
  });
});
