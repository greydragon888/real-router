import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import {
  act,
  configure,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { use } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "@real-router/react";

import { RouteContext, RouterContext } from "../../src/context";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

function RouteNameDisplay() {
  const routeCtx = use(RouteContext);

  return <div data-testid="route-name">{routeCtx?.route?.name}</div>;
}

describe("RouterProvider component", () => {
  let router: Router;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should provides value from context correctly", () => {
    const { result } = renderHook(() => use(RouterContext), {
      wrapper,
    });

    expect(result.current).toStrictEqual(router);
  });

  it("should render child component", () => {
    renderHook(() => use(RouterContext), {
      wrapper: () => (
        <RouterProvider router={router}>
          <div data-testid="child">Test</div>
        </RouterProvider>
      ),
    });

    expect(screen.getByTestId("child")).toHaveTextContent("Test");
  });

  it("should provides initial state from context", () => {
    const { result } = renderHook(() => use(RouteContext), {
      wrapper,
    });

    expect(result.current?.route?.name).toStrictEqual("test");
  });

  it("should updates context on router state change", async () => {
    const { result } = renderHook(() => use(RouteContext), {
      wrapper,
    });

    expect(result.current?.route?.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("one-more-test");
    });

    expect(result.current?.route?.name).toStrictEqual("one-more-test");
    expect(result.current?.previousRoute?.name).toStrictEqual("test");
  });

  it("should calls unsubscribe on unmount", () => {
    configure({ reactStrictMode: false });

    const unsubscribe = vi.fn();

    vi.spyOn(router, "subscribe").mockImplementation(() => unsubscribe);

    const { unmount } = renderHook(() => use(RouteContext), {
      wrapper,
    });

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);

    configure({ reactStrictMode: true });
  });

  it("should not resubscribe on rerender with same router", () => {
    configure({ reactStrictMode: false });

    vi.spyOn(router, "subscribe");

    const { rerender, unmount } = renderHook(() => use(RouteContext), {
      wrapper,
    });

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    rerender();

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    configure({ reactStrictMode: true });
  });

  it("should unsubscribe on unmount", () => {
    configure({ reactStrictMode: false });

    const unsubscribeSpy = vi.fn();

    vi.spyOn(router, "subscribe").mockImplementation((cb) => {
      // сразу возвращаем фейковый unsubscribe
      cb({
        route: router.getState()!,
        previousRoute: undefined,
      });

      return unsubscribeSpy;
    });

    const { unmount } = renderHook(() => use(RouteContext), { wrapper });

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);

    configure({ reactStrictMode: true });
  });

  it("should resubscribe when router instance changes", async () => {
    const router1 = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
      ],
      { defaultRoute: "home" },
    );

    router1.usePlugin(browserPluginFactory({}));
    await router1.start("/");

    const router2 = createRouter(
      [
        { name: "dashboard", path: "/" },
        { name: "settings", path: "/settings" },
      ],
      { defaultRoute: "dashboard" },
    );

    router2.usePlugin(browserPluginFactory({}));
    await router2.start("/");

    const { rerender } = render(
      <RouterProvider router={router1}>
        <RouteNameDisplay />
      </RouterProvider>,
    );

    expect(screen.getByTestId("route-name")).toHaveTextContent("home");

    rerender(
      <RouterProvider router={router2}>
        <RouteNameDisplay />
      </RouterProvider>,
    );

    expect(screen.getByTestId("route-name")).toHaveTextContent("dashboard");

    router1.stop();
    router2.stop();
  });
});
