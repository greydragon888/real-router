import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RouterErrorBoundary as MainRouterErrorBoundary,
  useRouteNode as MainUseRouteNode,
  useRoute as MainUseRoute,
  useNavigator as MainUseNavigator,
  useRouter as MainUseRouter,
  useRouteUtils as MainUseRouteUtils,
  useRouterTransition as MainUseRouterTransition,
} from "@real-router/react";
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
      // InkLink is memo() — verify React component structure, not just typeof.
      expect(InkLink).toHaveProperty("$$typeof", Symbol.for("react.memo"));
      // InkRouterProvider is ink-entry-specific (no Main* counterpart to compare with).
      // Check function name so a renamed/stub export fails explicitly.
      expect(InkRouterProvider.name).toBe("InkRouterProvider");
      expect(RouterErrorBoundary).toBe(MainRouterErrorBoundary);
    });

    it("should export all hooks", () => {
      expect(useRouteNode).toBe(MainUseRouteNode);
      expect(useRoute).toBe(MainUseRoute);
      expect(useNavigator).toBe(MainUseNavigator);
      expect(useRouter).toBe(MainUseRouter);
      expect(useRouteUtils).toBe(MainUseRouteUtils);
      expect(useRouterTransition).toBe(MainUseRouterTransition);
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
