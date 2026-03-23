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

    expect(result).toBeDefined();
    expect(result.navigate).toBeDefined();
    expect(result.getState).toBeDefined();
    expect(result.isActiveRoute).toBeDefined();
    expect(result.subscribe).toBeDefined();
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

    expect(state).toBeDefined();
    expect(state?.name).toBeDefined();
  });

  it("should have working isActiveRoute method", () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const state = result.getState();

    expect(result.isActiveRoute(state?.name ?? "")).toBe(true);
  });

  it("should have working subscribe method and return unsubscribe fn", () => {
    let result: any;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    expect(unsubscribe).toBeDefined();

    unsubscribe();
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() =>
      render(NavigatorCapture, {
        props: { onCapture: () => {} },
      }),
    ).toThrow();
  });
});
