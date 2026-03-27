import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRouteNode, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe(
  "Structural Sharing - Performance Tests",
  { tags: ["performance"] },
  () => {
    let router: Router;

    const wrapper = ({ children }: { children: ReactNode }) => (
      <RouterProvider router={router}>{children}</RouterProvider>
    );

    beforeEach(() => {
      router = createTestRouterWithADefaultRouter();
    });

    afterEach(() => {
      router.stop();
    });

    describe("Inactive Node Optimization", () => {
      it("should not re-render inactive node on unrelated navigation", async () => {
        await router.start("/");

        const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
          renderOptions: { wrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);

        ProfiledHook.snapshot();

        await act(async () => {
          await router.navigate("home");
        });

        await act(async () => {
          await router.navigate("about");
        });

        expect(ProfiledHook).toNotHaveRerendered();
      });
    });

    describe("Route Stabilization", () => {
      it("should stabilize route ref on reload to same route", async () => {
        await router.start("/users/1");

        const { result, ProfiledHook } = profileHook(
          () => useRouteNode("users"),
          { renderOptions: { wrapper } },
        );

        expect(ProfiledHook).toHaveRenderedTimes(1);

        const initialRoute = result.current.route;
        const initialSnapshot = {
          routeName: initialRoute?.name,
          routePath: initialRoute?.path,
        };

        ProfiledHook.snapshot();

        await act(async () => {
          await router.navigate("users.view", { id: "1" }, { reload: true });
        });

        const reloadedRoute = result.current.route;
        const reloadedSnapshot = {
          routeName: reloadedRoute?.name,
          routePath: reloadedRoute?.path,
        };

        expect(reloadedSnapshot).toStrictEqual(initialSnapshot);
        expect(reloadedRoute?.path).toBe(initialRoute?.path);
      });
    });
  },
);
