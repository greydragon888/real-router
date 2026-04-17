import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteCapture from "../helpers/RouteCapture.svelte";
import RouteCaptureWithProvider from "../helpers/RouteCaptureWithProvider.svelte";
import RouterCapture from "../helpers/RouterCapture.svelte";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

describe("RouterProvider component", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should provide value from context correctly", () => {
    let capturedRouter: unknown;

    renderWithRouter(router, RouterCapture, {
      onCapture: (r: unknown) => {
        capturedRouter = r;
      },
    });

    expect(capturedRouter).toStrictEqual(router);
  });

  it("should provide initial state from context", () => {
    let routeContext: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        routeContext = r;
      },
    });

    expect(routeContext?.route.current?.name).toStrictEqual("test");
  });

  it("should update context on router state change", async () => {
    let routeContext: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        routeContext = r;
      },
    });

    expect(routeContext?.route.current?.name).toStrictEqual("test");

    await router.navigate("one-more-test");
    flushSync();

    expect(routeContext?.route.current?.name).toStrictEqual("one-more-test");
    expect(routeContext?.previousRoute.current?.name).toStrictEqual("test");
  });

  it("should call unsubscribe on unmount", () => {
    const unsubscribeSpy = vi.fn();
    const realSubscribe = router.subscribe.bind(router);

    // Wrap the real subscribe so the subscription stays functional, but the
    // returned unsubscribe is observable.
    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      const realUnsub = realSubscribe(listener);

      return () => {
        unsubscribeSpy();
        realUnsub();
      };
    });

    const { unmount } = renderWithRouter(router, RouterCapture, {
      onCapture: () => {},
    });

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("should not resubscribe on rerender with same router", async () => {
    const subscribeSpy = vi.spyOn(router, "subscribe");

    const { rerender } = renderWithRouter(router, RouterCapture, {
      onCapture: () => {},
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    // Rerender with the same router prop — subscribe must not be called again.
    await rerender({ onCapture: () => {} });
    flushSync();

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("should provide previousRoute.current through real RouterProvider", async () => {
    let routeContext: RouteContext | undefined;

    render(RouteCaptureWithProvider, {
      props: {
        router,
        onCapture: (r: RouteContext) => {
          routeContext = r;
        },
      },
    });

    expect(routeContext?.route.current?.name).toStrictEqual("test");
    expect(routeContext?.previousRoute.current).toBeUndefined();

    await router.navigate("home");
    flushSync();

    expect(routeContext?.route.current?.name).toStrictEqual("home");
    expect(routeContext?.previousRoute.current?.name).toStrictEqual("test");

    expect(screen.getByTestId("route-name")).toHaveTextContent("home");
    expect(screen.getByTestId("previous-route")).toHaveTextContent("test");
  });
});
