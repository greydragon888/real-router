import { render } from "@testing-library/svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouter,
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouterCapture from "../helpers/RouterCapture.svelte";

import type { Router } from "@real-router/core";

describe("useRouter composable", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return router", () => {
    let result: unknown;

    renderWithRouter(router, RouterCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    expect(result).toStrictEqual(router);
  });

  it("should return stable reference across navigations", async () => {
    const routerWithRoutes = createTestRouterWithADefaultRouter();

    await routerWithRoutes.start("/");

    let result: unknown;

    renderWithRouter(routerWithRoutes, RouterCapture, {
      onCapture: (r: unknown) => {
        result = r;
      },
    });

    const firstRef = result;

    await routerWithRoutes.navigate("about");

    expect(result).toBe(firstRef);

    routerWithRoutes.stop();
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => {
      render(RouterCapture, {
        props: {
          onCapture: () => {},
        },
      });
    }).toThrow();
  });
});
