import { getNavigator } from "@real-router/core";
import { render } from "@testing-library/svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import NavigatorCapture from "../helpers/NavigatorCapture.svelte";

import type { Navigator, Router } from "@real-router/core";

describe("useNavigator composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    // Force the initial URL to "/" so getState() reliably returns "test" — without
    // this, state leaks between tests via the JSDOM window location.
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should return the same navigator instance as getNavigator(router)", () => {
    let result!: Navigator;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r as Navigator;
      },
    });

    // Identity check subsumes the four toBeTypeOf assertions that used to live
    // here. The dedicated "should have working …" tests below exercise each
    // method behaviorally, which is a stronger guarantee than typeof==="function".
    expect(result).toBe(getNavigator(router));
  });

  it("should have working navigate method", async () => {
    let result!: Navigator;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r as Navigator;
      },
    });

    const state = await result.navigate("items");

    expect(state).toStrictEqual(expect.objectContaining({ name: "items" }));
  });

  it("should have working getState method", () => {
    let result!: Navigator;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r as Navigator;
      },
    });

    const state = result.getState();

    expect(state).not.toBeNull();
    expect(state!.name).toBe("test");
  });

  it("should have working isActiveRoute method", () => {
    let result!: Navigator;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r as Navigator;
      },
    });

    expect(result.isActiveRoute("test")).toBe(true);
    expect(result.isActiveRoute("items")).toBe(false);
  });

  it("should have working subscribe method and return unsubscribe fn", async () => {
    let result!: Navigator;

    renderWithRouter(router, NavigatorCapture, {
      onCapture: (r: unknown) => {
        result = r as Navigator;
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
