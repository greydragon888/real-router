import { act, configure, renderHook, screen } from "@testing-library/react";
import { use } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  RouteContext,
  RouterContext,
  RouterProvider,
} from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

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

  it("should render chile component", () => {
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

    // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should not resubscribe on rerender with same router", () => {
    configure({ reactStrictMode: false });

    vi.spyOn(router, "subscribe");

    const { rerender, unmount } = renderHook(() => use(RouteContext), {
      wrapper,
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
    expect(router.subscribe).toHaveBeenCalledTimes(1);

    rerender();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("should unsubscribe on unmount", () => {
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

    // eslint-disable-next-line @typescript-eslint/unbound-method -- spied method
    expect(router.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
