import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InkLink,
  InkRouterProvider,
  RouterErrorBoundary,
  useNavigator,
  useRoute,
  useRouteNode,
  useRouter,
  useRouterTransition,
  useRouteUtils,
} from "@real-router/react/ink";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, PropsWithChildren } from "react";

const wrapper: FC<PropsWithChildren<{ router: Router }>> = ({
  children,
  router,
}) => <InkRouterProvider router={router}>{children}</InkRouterProvider>;

describe("ink entry point (@real-router/react/ink)", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("exports availability", () => {
    it("should export all components", () => {
      expect(InkLink).toBeTypeOf("object");
      expect(InkRouterProvider).toBeTypeOf("function");
      expect(RouterErrorBoundary).toBeTypeOf("function");
    });

    it("should export all hooks", () => {
      expect(useRouteNode).toBeTypeOf("function");
      expect(useRoute).toBeTypeOf("function");
      expect(useNavigator).toBeTypeOf("function");
      expect(useRouter).toBeTypeOf("function");
      expect(useRouteUtils).toBeTypeOf("function");
      expect(useRouterTransition).toBeTypeOf("function");
    });

    it("should not export DOM-bound APIs", async () => {
      const inkModule = await import("@real-router/react/ink");

      expect(inkModule).toHaveProperty("InkRouterProvider");
      expect(inkModule).not.toHaveProperty("Link");
      expect(inkModule).not.toHaveProperty("RouteView");
      expect(inkModule).not.toHaveProperty("RouterProvider");
      expect(inkModule).not.toHaveProperty("createRouteAnnouncer");
    });

    it("should not export raw context objects", async () => {
      const inkModule = await import("@real-router/react/ink");

      expect(inkModule).toHaveProperty("InkRouterProvider");
      expect(inkModule).not.toHaveProperty("RouterContext");
      expect(inkModule).not.toHaveProperty("RouteContext");
      expect(inkModule).not.toHaveProperty("NavigatorContext");
    });

    it("should export types (surface check)", () => {
      const linkProps: import("@real-router/react/ink").InkLinkProps = {
        routeName: "test",
      };
      const providerProps: import("@real-router/react/ink").InkRouterProviderProps =
        { router };

      expect(linkProps.routeName).toBe("test");
      expect(providerProps.router).toBe(router);
    });
  });

  describe("hook wiring through InkRouterProvider", () => {
    it("provides router via useRouter", () => {
      const { result } = renderHook(() => useRouter(), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      expect(result.current).toBe(router);
    });

    it("updates route state through useRouteNode on navigation", async () => {
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
