// Solid useRouteExit tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteExit.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Solid components run **once** at mount; the handler is captured in
//     closure at the call site and there is no re-render-driven swap.
//     Reactivity in Solid happens through signals consumed inside the
//     handler body — not by replacing the handler reference.
//   - StrictMode test is React-only — Solid has no equivalent.
//
// All other tests mirror the React suite 1:1.

import { render, renderHook } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider, useRouteExit } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type {
  RouteExitContext,
  RouteExitHandler,
  UseRouteExitOptions,
} from "@real-router/solid";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

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

    renderHook(
      () => {
        useRouteExit(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("about");

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx: RouteExitContext = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("test");
    expect(ctx.nextRoute.name).toBe("about");
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    renderHook(
      () => {
        useRouteExit(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("users.view", { id: "1" });
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();
    const options: UseRouteExitOptions = { skipSameRoute: false };

    renderHook(
      () => {
        useRouteExit(handler, options);
      },
      {
        wrapper: wrapper(router),
      },
    );

    await router.navigate("users.view", { id: "1" });
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("blocks navigation until the returned Promise resolves", async () => {
    let resolveExit!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const handler: RouteExitHandler = vi.fn(() => exitPromise);

    renderHook(
      () => {
        useRouteExit(handler);
      },
      { wrapper: wrapper(router) },
    );

    let navigated = false;
    const navigation = router.navigate("about").then(() => {
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

  it("unsubscribes on unmount", async () => {
    const handler = vi.fn();

    const { cleanup } = renderHook(
      () => {
        useRouteExit(handler);
      },
      {
        wrapper: wrapper(router),
      },
    );

    cleanup();

    await router.navigate("about");

    expect(handler).not.toHaveBeenCalled();
  });

  it("provides AbortSignal context to the handler", async () => {
    let receivedSignal: AbortSignal | undefined;
    const handler = vi.fn(({ signal }) => {
      receivedSignal = signal;
    });

    renderHook(
      () => {
        useRouteExit(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("about");

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);
  });

  it("handler is captured at init — replacing the handler reference has no effect (gotcha #1)", async () => {
    // Solid components run **once** at mount; `useRouteExit(handler)` reads
    // its argument synchronously during init and stores it in a closure on
    // the subscribeLeave listener. Swapping the prop/signal that produced
    // the handler later must NOT reach the live subscription.
    //
    // Mirrors the React "uses the latest handler reference without resubscribing"
    // test inverted — React DOES swap via handlerRef; Solid does NOT.
    const initialHandler = vi.fn();
    const swappedHandler = vi.fn();
    const [handler, setHandler] =
      createSignal<typeof initialHandler>(initialHandler);

    render(() => (
      <RouterProvider router={router}>
        <ProbeExit handler={handler()} />
      </RouterProvider>
    ));

    // Swap the signal BEFORE navigating — useRouteExit already captured
    // `initialHandler` at component init, so this update is invisible to
    // the subscribed listener.
    setHandler(() => swappedHandler);

    await router.navigate("about");

    expect(initialHandler).toHaveBeenCalledTimes(1);
    expect(swappedHandler).not.toHaveBeenCalled();
  });

  it("skips the handler when signal is already aborted (reentrant abort)", () => {
    // Stub subscribeLeave via spy so we can inject a pre-aborted signal.
    // This exercises the early-return branch that's hard to reproduce via
    // real navigation timing without races.
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

    render(() => (
      <RouterProvider router={router}>
        <ProbeExit handler={handler} />
      </RouterProvider>
    ));

    const controller = new AbortController();

    controller.abort();

    for (const listener of leaveListeners) {
      void listener({
        route: router.getState()!,
        nextRoute: router.getState()!,
        signal: controller.signal,
      });
    }

    expect(handler).not.toHaveBeenCalled();
  });
});

function ProbeExit(
  props: Readonly<{
    handler: RouteExitHandler;
    options?: UseRouteExitOptions;
  }>,
): JSX.Element {
  useRouteExit(props.handler, props.options);

  return <div data-testid="probe" />;
}
