import { renderHook, act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  Link,
  RouterErrorBoundary,
  useRouteNode,
  useRoute,
  useNavigator,
  useRouter,
  useRouteUtils,
  useRouterTransition,
  RouterProvider,
} from "@real-router/react/legacy";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, PropsWithChildren } from "react";

const wrapper: FC<PropsWithChildren<{ router: Router }>> = ({
  children,
  router,
}) => <RouterProvider router={router}>{children}</RouterProvider>;

describe("legacy entry point (@real-router/react/legacy)", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("exports availability", () => {
    it("should export all components", () => {
      expect(Link).toBeTypeOf("object");
      expect(RouterErrorBoundary).toBeTypeOf("function");
    });

    it("should not export RouteView (React 19.2+ only)", async () => {
      const legacyModule = await import("@real-router/react/legacy");

      expect(legacyModule).not.toHaveProperty("RouteView");
    });

    it("should export all hooks", () => {
      expect(useRouteNode).toBeTypeOf("function");
      expect(useRoute).toBeTypeOf("function");
      expect(useNavigator).toBeTypeOf("function");
      expect(useRouter).toBeTypeOf("function");
      expect(useRouteUtils).toBeTypeOf("function");
      expect(useRouterTransition).toBeTypeOf("function");
    });

    it("should not export raw context objects", async () => {
      const legacyModule = await import("@real-router/react/legacy");

      expect(legacyModule).not.toHaveProperty("RouterContext");
      expect(legacyModule).not.toHaveProperty("RouteContext");
      expect(legacyModule).not.toHaveProperty("NavigatorContext");
    });

    it("should export RouterProvider", () => {
      expect(RouterProvider).toBeTypeOf("function");
    });

    it("should export LinkProps type", () => {
      const linkProps: import("@real-router/react/legacy").LinkProps = {
        routeName: "test",
      };

      expect(linkProps.routeName).toBe("test");
    });

    it("should not export RouteView types", async () => {
      const legacyModule = await import("@real-router/react/legacy");

      expect(legacyModule).not.toHaveProperty("RouteView");
    });
  });

  describe("basic rendering", () => {
    it("should provide router via useRouter", () => {
      const { result } = renderHook(() => useRouter(), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      expect(result.current).toStrictEqual(router);
    });

    it("should provide route state via useRouteNode", async () => {
      const { result } = renderHook(() => useRouteNode(""), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });

      expect(result.current.route?.name).toBe("test");
      expect(result.current.navigator).toBeTypeOf("object");
    });
  });

  describe("navigation", () => {
    it("should handle navigation and update route state", async () => {
      const { result } = renderHook(() => useRouteNode(""), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });

      expect(result.current.route?.name).toBe("test");

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");
      expect(result.current.previousRoute?.name).toBe("test");
    });
  });
});
