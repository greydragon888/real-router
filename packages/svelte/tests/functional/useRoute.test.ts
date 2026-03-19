import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteCapture from "../helpers/RouteCapture.svelte";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

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

    expect(result!.navigator).toBeDefined();
    expect(result!.navigator.navigate).toBeDefined();
    expect(result!.navigator.getState).toBeDefined();
    expect(result!.navigator.isActiveRoute).toBeDefined();
    expect(result!.navigator.subscribe).toBeDefined();
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

  it("should throw error if router instance was not passed to provider", () => {
    expect(() =>
      render(RouteCapture, {
        props: { onCapture: () => {} },
      }),
    ).toThrow();
  });
});
