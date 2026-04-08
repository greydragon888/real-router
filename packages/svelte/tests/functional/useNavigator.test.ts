import { render } from "@testing-library/svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import NavigatorCapture from "../helpers/NavigatorCapture.svelte";

import type { Router } from "@real-router/core";

describe("useNavigator composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator with 4 methods", () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result).toBeTypeOf("object");
    expect(result.navigate).toBeTypeOf("function");
    expect(result.getState).toBeTypeOf("function");
    expect(result.isActiveRoute).toBeTypeOf("function");
    expect(result.subscribe).toBeTypeOf("function");
  });

  it("should have working navigate method", async () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const state = await result.navigate("items");

    expect(state).toStrictEqual(expect.objectContaining({ name: "items" }));
  });

  it("should have working getState method", () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const state = result.getState();

    expect(state).not.toBeNull();
    expect(state!.name).toBeTypeOf("string");
  });

  it("should have working isActiveRoute method", () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const state = result.getState();

    expect(state).not.toBeNull();
    expect(result.isActiveRoute(state!.name)).toBe(true);
  });

  it("should have working subscribe method and return unsubscribe fn", async () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    await result.navigate("about");

    expect(callback).toHaveBeenCalled();

    const callCount = callback.mock.calls.length;

    unsubscribe();

    await result.navigate("home");

    expect(callback).toHaveBeenCalledTimes(callCount);
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() =>
      render(NavigatorCapture, {
        props: { onCapture: () => {} },
      }),
    ).toThrow();
  });
});
