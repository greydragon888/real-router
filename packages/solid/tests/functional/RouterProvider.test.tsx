import { renderHook, render, screen } from "@solidjs/testing-library";
import { useContext } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { RouterContext, RouteContext } from "../../src/context";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

// SKIP: #422 — babel-preset-solid dual-module hazard after removing "development" export condition (#421).
// useContext(RouterContext) returns undefined because babel-compiled RouterProvider.tsx and test code
// resolve @real-router/solid context from different module instances (alias-resolved source vs
// babel-transformed code). Does NOT affect production — only test infrastructure.
// Fix tracked in: https://github.com/greydragon888/real-router/issues/422
describe.todo("RouterProvider component", () => {
  let router: Router;

  const wrapper = (props: { children: JSX.Element }) => (
    <RouterProvider router={router}>{props.children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should provide value from context correctly", () => {
    const { result } = renderHook(() => useContext(RouterContext), {
      wrapper,
    });

    expect(result?.router).toStrictEqual(router);
  });

  it("should render child component", () => {
    render(() => (
      <RouterProvider router={router}>
        <div data-testid="child">Test</div>
      </RouterProvider>
    ));

    expect(screen.getByTestId("child")).toHaveTextContent("Test");
  });

  it("should provide initial state from context", () => {
    const { result } = renderHook(() => useContext(RouteContext), {
      wrapper,
    });

    expect(result!().route!.name).toStrictEqual("test");
  });

  it("should update context on router state change", async () => {
    const { result } = renderHook(() => useContext(RouteContext), {
      wrapper,
    });

    expect(result!().route!.name).toStrictEqual("test");

    await router.navigate("one-more-test");

    expect(result!().route!.name).toStrictEqual("one-more-test");
    expect(result!().previousRoute!.name).toStrictEqual("test");
  });

  it("should call unsubscribe on unmount", () => {
    const unsubscribe = vi.fn();

    vi.spyOn(router, "subscribe").mockImplementation(() => unsubscribe);

    const { cleanup } = renderHook(() => useContext(RouteContext), {
      wrapper,
    });

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    cleanup();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should provide navigator via RouterContext", () => {
    const { result } = renderHook(() => useContext(RouterContext), {
      wrapper,
    });

    expect(result?.navigator).toBeDefined();
    expect(result?.navigator.navigate).toBeDefined();
    expect(result?.navigator.getState).toBeDefined();
  });

  it("should render without children", () => {
    const { container } = render(() => (
      <RouterProvider router={router}>
        {undefined as unknown as JSX.Element}
      </RouterProvider>
    ));

    expect(container).toBeDefined();
  });

  it("should render multiple children", () => {
    render(() => (
      <RouterProvider router={router}>
        <div data-testid="a">A</div>
        <div data-testid="b">B</div>
        <div data-testid="c">C</div>
      </RouterProvider>
    ));

    expect(screen.getByTestId("a")).toBeInTheDocument();
    expect(screen.getByTestId("b")).toBeInTheDocument();
    expect(screen.getByTestId("c")).toBeInTheDocument();
  });
});
