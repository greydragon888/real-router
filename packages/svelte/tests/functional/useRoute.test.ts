import { getNavigator } from "@real-router/core";
import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteCapture from "../helpers/RouteCapture.svelte";

import type { RouteContext } from "../../src";
import type { Params, Router } from "@real-router/core";

describe("useRoute composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator", () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    expect(result!.navigator).toBe(getNavigator(router));
  });

  it("should return current route", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    expect(result!.route.current?.name).toStrictEqual("test");

    await router.navigate("items");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items");
  });

  it("should reactively update route.current through multiple navigations", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    // Start at a known route to avoid URL pollution from previous tests
    await router.navigate("test");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("test");

    // Navigate and verify the reactive .current getter reflects the new route
    await router.navigate("items");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items");

    // Navigate to a child route with params
    await router.navigate("items.item", { id: "42" });
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items.item");
    expect(result!.route.current?.params).toStrictEqual({ id: "42" });

    // Navigate back to a top-level route
    await router.navigate("home");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("home");

    // Verify previousRoute also updates reactively
    expect(result!.previousRoute.current?.name).toStrictEqual("items.item");
  });

  it("should update route.current when navigating to deeply nested routes", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    // Start at a known route to avoid URL pollution from previous tests
    await router.navigate("test");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("test");

    await router.navigate("users.list");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("users.list");

    await router.navigate("users.edit", { id: "7" });
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("users.edit");
    expect(result!.route.current?.params).toStrictEqual({ id: "7" });

    // Navigate away from users entirely
    await router.navigate("about");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("about");
    expect(result!.previousRoute.current?.name).toStrictEqual("users.edit");
  });

  it("should update previousRoute after navigation", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    // Navigate to a known route first
    await router.navigate("home");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("home");

    await router.navigate("items");
    flushSync();

    expect(result!.route.current?.name).toStrictEqual("items");
    expect(result!.previousRoute.current?.name).toStrictEqual("home");
  });

  it("should return frozen state from .current getter", async () => {
    let result: RouteContext | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        result = r;
      },
    });

    await router.navigate("home");
    flushSync();

    const snapshot = result!.route.current;

    expect(snapshot).not.toBeNull();
    expect(snapshot).not.toBeUndefined();
    expect(snapshot!.name).toBe("home");

    // Primary invariant: snapshot is actually frozen.
    expect(Object.isFrozen(snapshot)).toBe(true);

    // Derived invariant in strict mode: write throws.
    expect(() => {
      (snapshot as unknown as Record<string, unknown>).name = "mutated";
    }).toThrow(TypeError);

    // After the failed mutation, the value should be unchanged
    expect(result!.route.current!.name).toBe("home");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() =>
      render(RouteCapture, {
        props: { onCapture: () => {} },
      }),
    ).toThrow();
  });

  it("should propagate generic params type without runtime change", async () => {
    type TypedParams = { id: string; tab: string } & Params;

    await router.navigate("test");
    flushSync();

    let typed: RouteContext<TypedParams> | undefined;

    renderWithRouter(router, RouteCapture, {
      onCapture: (r: RouteContext) => {
        typed = r as RouteContext<TypedParams>;
      },
    });

    const params: TypedParams | undefined = typed!.route.current?.params;

    expect(typed!.route.current?.name).toStrictEqual("test");
    expect(params).toBeDefined();
  });
});
