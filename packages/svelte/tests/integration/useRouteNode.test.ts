import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import RouteNodeCapture from "../helpers/RouteNodeCapture.svelte";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

describe("useRouteNode - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Component Integration", () => {
    it("should work with real route updates", async () => {
      await router.start("/users/list");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "users",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      expect(result!.route.current?.name).toBe("users.list");
    });

    it("should support conditional rendering based on node activity", async () => {
      await router.start("/about");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "users",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      expect(result!.route.current).toBeUndefined();

      await router.navigate("users.list");
      flushSync();

      expect(result!.route.current?.name).toBe("users.list");
    });

    it("should update component when route params change", async () => {
      await router.start("/users/list");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "users",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      await router.navigate("users.view", { id: "123" });
      flushSync();

      expect(result!.route.current?.params).toStrictEqual({ id: "123" });

      await router.navigate("users.view", { id: "456" });
      flushSync();

      expect(result!.route.current?.params).toStrictEqual({ id: "456" });
    });

    it("should provide navigator for programmatic navigation", async () => {
      await router.start("/users/list");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "users",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      await result!.navigator.navigate("users.view", { id: "1" });
      flushSync();

      expect(result!.route.current?.name).toBe("users.view");
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent node subscription", async () => {
      await router.start("/users/list");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "nonexistent.node.path",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      expect(result!.route.current).toBeUndefined();
      expect(result!.navigator).toBeDefined();
    });

    it("should handle rapid navigation", async () => {
      await router.start("/users/list");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "users",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.edit", { id: "1" });
      await router.navigate("users.view", { id: "2" });
      flushSync();

      expect(result!.route.current?.name).toBe("users.view");
      expect(result!.route.current?.params).toStrictEqual({ id: "2" });
    });

    it("should maintain navigator reference across navigations", async () => {
      await router.start("/users/list");

      let result: RouteContext | undefined;

      renderWithRouter(router, RouteNodeCapture, {
        nodeName: "users",
        onCapture: (r: RouteContext) => {
          result = r;
        },
      });

      const initialNavigator = result!.navigator;

      await router.navigate("users.view", { id: "1" });
      flushSync();

      expect(result!.navigator).toBe(initialNavigator);
    });
  });
});
