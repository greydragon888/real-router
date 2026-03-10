import { render, screen, act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRouteNode, RouteView, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

describe("RouteView - Performance Tests", () => {
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

  describe("Re-renders within nodeName", () => {
    it("should re-render on navigation within subscribed node", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
    });
  });

  describe("Re-renders outside nodeName", () => {
    it("should not re-render when navigating between unrelated nodes", async () => {
      await router.start("/about");

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

  describe("Sibling isolation", () => {
    it("should not re-render sibling components when Match changes", async () => {
      await router.start("/users/list");

      let siblingRenders = 0;

      const Sibling: FC = () => {
        siblingRenders++;

        return <div data-testid="sibling">Sibling</div>;
      };

      render(
        <RouterProvider router={router}>
          <Sibling />
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      // eslint-disable-next-line testing-library/render-result-naming-convention
      const siblingRendersAfterMount = siblingRenders;

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("view")).toBeInTheDocument();
      expect(siblingRenders).toBe(siblingRendersAfterMount);
    });
  });

  describe("Match children", () => {
    it("should only render the matched child, not all Match children", async () => {
      await router.start("/users/list");

      let listRenders = 0;
      let viewRenders = 0;
      let editRenders = 0;

      const ListPage: FC = () => {
        listRenders++;

        return <div data-testid="list">List</div>;
      };

      const ViewPage: FC = () => {
        viewRenders++;

        return <div data-testid="view">View</div>;
      };

      const EditPage: FC = () => {
        editRenders++;

        return <div data-testid="edit">Edit</div>;
      };

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <ListPage />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <ViewPage />
            </RouteView.Match>
            <RouteView.Match segment="edit">
              <EditPage />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(listRenders).toBeGreaterThan(0);
      expect(viewRenders).toBe(0);
      expect(editRenders).toBe(0);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(viewRenders).toBeGreaterThan(0);
      expect(editRenders).toBe(0);
    });
  });
});
