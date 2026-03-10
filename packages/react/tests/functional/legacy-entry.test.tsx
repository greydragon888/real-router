import { renderHook, act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  // Components
  Link,
  // Hooks
  useRouteNode,
  useRoute,
  useNavigator,
  useRouter,
  useRouteUtils,
  useIsActiveRoute,
  // Context
  RouterProvider,
  RouterContext,
  RouteContext,
  NavigatorContext,
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
      expect(Link).toBeDefined();
    });

    it("should export all hooks", () => {
      expect(useRouteNode).toBeDefined();
      expect(useRoute).toBeDefined();
      expect(useNavigator).toBeDefined();
      expect(useRouter).toBeDefined();
      expect(useRouteUtils).toBeDefined();
      expect(useIsActiveRoute).toBeDefined();
    });

    it("should export context objects", () => {
      expect(RouterContext).toBeDefined();
      expect(RouteContext).toBeDefined();
      expect(NavigatorContext).toBeDefined();
    });

    it("should export RouterProvider", () => {
      expect(RouterProvider).toBeDefined();
    });

    it("should export LinkProps type", () => {
      const linkProps: import("@real-router/react/legacy").LinkProps = {
        routeName: "test",
      };

      expect(linkProps.routeName).toBe("test");
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
      expect(result.current.navigator).toBeDefined();
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
