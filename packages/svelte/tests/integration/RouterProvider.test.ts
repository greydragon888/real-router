import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteCapture from "../helpers/RouteCapture.svelte";
import RouterCapture from "../helpers/RouterCapture.svelte";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

describe("RouterProvider - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Basic Integration", () => {
    it("should provide router instance", async () => {
      await router.start("/users/list");
      let capturedRouter: unknown;

      renderWithRouter(router, RouterCapture, {
        onCapture: (r: unknown) => {
          capturedRouter = r;
        },
      });

      expect(capturedRouter).toBe(router);
    });

    it("should throw error when context is accessed without provider", async () => {
      const { render: rawRender } = await import("@testing-library/svelte");

      expect(() => {
        rawRender(RouterCapture, { props: { onCapture: () => {} } });
      }).toThrow();
    });
  });

  describe("Navigation Updates", () => {
    it("should update route on navigation", async () => {
      await router.start("/users/list");
      let routeContext: RouteContext | undefined;

      renderWithRouter(router, RouteCapture, {
        onCapture: (r: RouteContext) => {
          routeContext = r;
        },
      });

      expect(routeContext?.route.current?.name).toBe("users.list");

      await router.navigate("about");
      flushSync();

      expect(routeContext?.route.current?.name).toBe("about");
      expect(routeContext?.previousRoute.current?.name).toBe("users.list");
    });
  });

  describe("Edge Cases", () => {
    it("should handle router not started", () => {
      let routeContext: RouteContext | undefined;

      renderWithRouter(router, RouteCapture, {
        onCapture: (r: RouteContext) => {
          routeContext = r;
        },
      });

      expect(routeContext?.route.current?.name).toBeUndefined();
    });

    it("should handle unmount correctly", async () => {
      await router.start("/users/list");
      let routeContext: RouteContext | undefined;

      const { unmount } = renderWithRouter(router, RouteCapture, {
        onCapture: (r: RouteContext) => {
          routeContext = r;
        },
      });

      expect(routeContext?.route.current?.name).toBe("users.list");

      unmount();

      await router.navigate("about");

      expect(router.getState()?.name).toBe("about");
    });
  });
});
