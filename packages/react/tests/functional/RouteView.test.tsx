import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen, act } from "@testing-library/react";
import { lazy, useEffect, useRef } from "react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouteView, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

describe("RouteView", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Segment matching", () => {
    it("should render matched Match", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should return null if no match", async () => {
      await router.start("/about");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should support exact matching — matches exact route only", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact>
              <div data-testid="users-exact">Users Exact</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-exact")).toBeInTheDocument();
    });

    it("should support exact matching — does not match descendants", async () => {
      await router.start("/users/list");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact>
              <div data-testid="users-exact">Users Exact</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users-exact")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should support startsWith matching by default", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should render first Match on multiple matches", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="first">First</div>
            </RouteView.Match>
            <RouteView.Match segment="users">
              <div data-testid="second">Second</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("first")).toBeInTheDocument();
      expect(screen.queryByTestId("second")).not.toBeInTheDocument();
    });

    it("should correctly build fullSegmentName for nested RouteView", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="users-view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("users-view")).not.toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
      expect(screen.getByTestId("users-view")).toBeInTheDocument();
    });

    it("should be dot-boundary safe", async () => {
      getRoutesApi(router).add([
        {
          name: "users2",
          path: "/users2",
          children: [{ name: "list", path: "/list" }],
        },
      ]);

      await router.start("/users2/list");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should never match a Match with empty segment string (safety: early return)", async () => {
      await router.start("/users/list");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="">
              <div data-testid="empty-match">Empty</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("empty-match")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });
  });

  describe("NotFound", () => {
    let notFoundRouter: Router;

    beforeEach(() => {
      notFoundRouter = createRouter(
        [
          { name: "test", path: "/" },
          { name: "home", path: "/home" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
        ],
        {
          defaultRoute: "test",
          allowNotFound: true,
        },
      );
      notFoundRouter.usePlugin(browserPluginFactory({}));
    });

    afterEach(() => {
      notFoundRouter.stop();
    });

    it("should render NotFound for UNKNOWN_ROUTE", async () => {
      await notFoundRouter.start("/non-existent-path");

      render(
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="not-found">Not Found</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });

    it("should not render NotFound for regular routes without match", async () => {
      await router.start("/about");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="not-found">Not Found</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should use last NotFound when multiple are present", async () => {
      await notFoundRouter.start("/non-existent-path");

      render(
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.NotFound>
              <div data-testid="first-nf">First</div>
            </RouteView.NotFound>
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="last-nf">Last</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("first-nf")).not.toBeInTheDocument();
      expect(screen.getByTestId("last-nf")).toBeInTheDocument();
    });

    it("should work with NotFound only (no Match)", async () => {
      await notFoundRouter.start("/non-existent-path");

      render(
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.NotFound>
              <div data-testid="not-found">Not Found</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });

    it("should return null on UNKNOWN_ROUTE without NotFound", async () => {
      await notFoundRouter.start("/non-existent-path");

      const { container } = render(
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });
  });

  describe("Self", () => {
    it("renders Self when active route name equals nodeName (no descendant active)", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">UsersList</div>
            </RouteView.Self>
            <RouteView.Match segment="view">
              <div data-testid="users-view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-self")).toBeInTheDocument();
      expect(screen.queryByTestId("users-view")).not.toBeInTheDocument();
    });

    it("does not render Self when a descendant Match is active", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">UsersList</div>
            </RouteView.Self>
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("users-self")).not.toBeInTheDocument();
    });

    it("does not render Self when no descendant matches but active != nodeName", async () => {
      await router.start("/users/list");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
            {/* No Match for "list" — Self should still NOT fire because activeName !== nodeName */}
          </RouteView>
        </RouterProvider>,
      );

      expect(container.innerHTML).toBe("");
    });

    it("position-independent: Self before Match is still ignored when descendant is active", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("users-self")).not.toBeInTheDocument();
    });

    it("first <Self> wins when multiple are provided", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self-first">First</div>
            </RouteView.Self>
            <RouteView.Self>
              <div data-testid="users-self-second">Second</div>
            </RouteView.Self>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-self-first")).toBeInTheDocument();
      expect(screen.queryByTestId("users-self-second")).not.toBeInTheDocument();
    });

    it("Self has priority over NotFound when active === nodeName", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
            <RouteView.NotFound>
              <div data-testid="not-found">404</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-self")).toBeInTheDocument();
      expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
    });

    it("NotFound still renders for UNKNOWN_ROUTE even when Self is present", async () => {
      const routesApi = getRoutesApi(router);

      // Force allowNotFound on this fresh router clone
      router.stop();
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
        ],
        { defaultRoute: "home", allowNotFound: true },
      );
      router.usePlugin(browserPluginFactory({}));

      // Sanity: routesApi is reachable on the rebuilt router (we don't
      // mutate, but the cast keeps the lint rule out of the way).
      expect(routesApi).toBeDefined();

      await router.start("/nonexistent");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Self>
              <div data-testid="root-self">RootSelf</div>
            </RouteView.Self>
            <RouteView.NotFound>
              <div data-testid="not-found">404</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      // Self never fires at root (nodeName="" can't equal a real activeName).
      // NotFound wins for UNKNOWN_ROUTE.
      expect(screen.getByTestId("not-found")).toBeInTheDocument();
      expect(screen.queryByTestId("root-self")).not.toBeInTheDocument();
    });

    it("Self with fallback prop wraps content in Suspense", async () => {
      await router.start("/users");

      const LazySelf = lazy(
        () =>
          new Promise<{ default: FC }>((resolve) => {
            setTimeout(() => {
              resolve({
                default: () => <div data-testid="lazy-self">LazyLoaded</div>,
              });
            }, 0);
          }),
      );

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self
              fallback={<div data-testid="self-fallback">Loading...</div>}
            >
              <LazySelf />
            </RouteView.Self>
          </RouteView>
        </RouterProvider>,
      );

      // Initially fallback renders while lazy module resolves
      expect(screen.getByTestId("self-fallback")).toBeInTheDocument();

      // After lazy resolves, content swaps in
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(screen.getByTestId("lazy-self")).toBeInTheDocument();
    });

    it("transition: descendant active → parent active swaps Match → Self", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users");
      });

      expect(screen.getByTestId("users-self")).toBeInTheDocument();
      expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
    });
  });

  describe("Children handling", () => {
    it("should ignore non-Match/non-NotFound children", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            {"some string"}
            <div data-testid="random">Random</div>
            {null}
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should support Match and NotFound wrapped in Fragment", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <>
              <RouteView.Match segment="users">
                <div data-testid="users">Users</div>
              </RouteView.Match>
              <RouteView.Match segment="about">
                <div data-testid="about">About</div>
              </RouteView.Match>
            </>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeInTheDocument();
      expect(screen.queryByTestId("about")).not.toBeInTheDocument();
    });

    it("should support Match in array children", async () => {
      await router.start("/users/list");

      const matches = [
        <RouteView.Match key="users" segment="users">
          <div data-testid="users">Users</div>
        </RouteView.Match>,
        <RouteView.Match key="about" segment="about">
          <div data-testid="about">About</div>
        </RouteView.Match>,
      ];

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">{matches}</RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeInTheDocument();
      expect(screen.queryByTestId("about")).not.toBeInTheDocument();
    });

    it("should return null for empty RouteView", async () => {
      await router.start("/users/list");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">{null as unknown as ReactNode}</RouteView>
        </RouterProvider>,
      );

      expect(container.innerHTML).toBe("");
    });
  });

  describe("Marker components", () => {
    it("Match renders null when used standalone", () => {
      const { container } = render(
        <RouteView.Match segment="x">content</RouteView.Match>,
      );

      expect(container.innerHTML).toBe("");
    });

    it("Self renders null when used standalone", () => {
      const { container } = render(<RouteView.Self>content</RouteView.Self>);

      expect(container.innerHTML).toBe("");
    });

    it("NotFound renders null when used standalone", () => {
      const { container } = render(
        <RouteView.NotFound>content</RouteView.NotFound>,
      );

      expect(container.innerHTML).toBe("");
    });
  });

  describe("State", () => {
    it("should return null if route is undefined (router not started)", () => {
      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });
  });

  describe("Re-renders", () => {
    it("should re-render when navigating within nodeName", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
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

      expect(screen.getByTestId("list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.queryByTestId("list")).not.toBeInTheDocument();
      expect(screen.getByTestId("view")).toBeInTheDocument();
    });

    it("should not re-render when navigating outside nodeName", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.queryByTestId("list")).not.toBeInTheDocument();
    });
  });

  describe("keepAlive", () => {
    it("should wrap keepAlive Match in Activity mode=visible when active", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <div data-testid="list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("list")).toBeInTheDocument();
      expect(screen.getByTestId("list")).toBeVisible();
    });

    it("should hide keepAlive Match via Activity mode=hidden on deactivation", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("list")).toBeVisible();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("list")).toBeInTheDocument();
      expect(screen.getByTestId("list")).not.toBeVisible();
      expect(screen.getByTestId("view")).toBeVisible();
    });

    it("should not render keepAlive Match before first activation (lazy mount)", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("list")).toBeInTheDocument();
      expect(screen.queryByTestId("view")).not.toBeInTheDocument();
    });

    it("should not change behavior of regular Match without keepAlive", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
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

      expect(screen.getByTestId("list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.queryByTestId("list")).not.toBeInTheDocument();
      expect(screen.getByTestId("view")).toBeInTheDocument();
    });

    it("should render multiple keepAlive matches simultaneously (visible + hidden)", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("list")).toBeVisible();
      expect(screen.queryByTestId("view")).not.toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("list")).toBeInTheDocument();
      expect(screen.getByTestId("list")).not.toBeVisible();
      expect(screen.getByTestId("view")).toBeVisible();
    });

    it("should switch Activity back to visible on reactivation", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("list")).toBeVisible();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("list")).not.toBeVisible();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(screen.getByTestId("list")).toBeVisible();
      expect(screen.queryByTestId("view")).not.toBeInTheDocument();
    });

    it("should call useEffect cleanup on hidden and setup on visible", async () => {
      const setup = vi.fn();
      const cleanup = vi.fn();

      const TrackedComponent: FC = () => {
        useEffect(() => {
          setup();

          return () => {
            cleanup();
          };
        }, []);

        return <div data-testid="tracked">Tracked</div>;
      };

      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <TrackedComponent />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      const setupAfterMount = setup.mock.calls.length;
      const cleanupAfterMount = cleanup.mock.calls.length;

      // StrictMode may double-invoke effects: expect 1 (no StrictMode) or 2 (with StrictMode).
      expect(setupAfterMount).toBeGreaterThanOrEqual(1);
      expect(setupAfterMount).toBeLessThanOrEqual(2);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(cleanup.mock.calls.length).toBeGreaterThan(cleanupAfterMount);

      const setupBeforeReactivation = setup.mock.calls.length;

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(setup.mock.calls.length).toBeGreaterThan(setupBeforeReactivation);
    });

    it("should work with keepAlive + exact matching", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact keepAlive>
              <div data-testid="users-exact">Users Exact</div>
            </RouteView.Match>
            <RouteView.Match segment="about">
              <div data-testid="about">About</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-exact")).toBeVisible();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("users-exact")).not.toBeVisible();
      expect(screen.getByTestId("about")).toBeVisible();
    });

    it("should render NotFound and keep hidden keepAlive on UNKNOWN_ROUTE", async () => {
      const notFoundRouter = createRouter(
        [
          { name: "test", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "test", allowNotFound: true },
      );

      notFoundRouter.usePlugin(browserPluginFactory({}));
      await notFoundRouter.start("/users/list");

      render(
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" keepAlive>
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="not-found">404</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeVisible();

      act(() => {
        notFoundRouter.navigateToNotFound("/unknown");
      });

      expect(screen.getByTestId("users")).not.toBeVisible();
      expect(screen.getByTestId("not-found")).toBeInTheDocument();

      notFoundRouter.stop();
    });

    it("should render NotFound on UNKNOWN_ROUTE without keepAlive (unchanged)", async () => {
      const notFoundRouter = createRouter(
        [
          { name: "test", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
        ],
        { defaultRoute: "test", allowNotFound: true },
      );

      notFoundRouter.usePlugin(browserPluginFactory({}));
      await notFoundRouter.start("/users/list");

      render(
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="not-found">404</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users")).toBeInTheDocument();

      act(() => {
        notFoundRouter.navigateToNotFound("/unknown");
      });

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(screen.getByTestId("not-found")).toBeInTheDocument();

      notFoundRouter.stop();
    });

    it("should preserve DOM state across hide/show cycles", async () => {
      const InputComponent: FC = () => {
        const inputRef = useRef<HTMLInputElement>(null);

        return (
          <input ref={inputRef} data-testid="input" defaultValue="typed" />
        );
      };

      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <InputComponent />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      const input = screen.getByTestId("input");

      expect((input as HTMLInputElement).value).toBe("typed");

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.list");
      });

      const restoredInput = screen.getByTestId("input");

      expect((restoredInput as HTMLInputElement).value).toBe("typed");
    });

    it("should reset hasBeenActivatedRef on unmount/remount — keepAlive state is NOT preserved", async () => {
      let renderCount = 0;

      const StatefulComponent: FC = () => {
        renderCount++;

        return <div data-testid="stateful">Render #{renderCount}</div>;
      };

      await router.start("/users/list");

      // Mount RouteView with keepAlive
      const { unmount } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <StatefulComponent />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("stateful")).toBeVisible();

      // Navigate away — keepAlive hides the component
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("stateful")).not.toBeVisible();

      // Unmount the entire RouteView tree
      unmount();

      // Navigate to a different segment for later test
      await act(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      renderCount = 0;

      // Remount RouteView — hasBeenActivatedRef is a fresh Set
      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <StatefulComponent />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      // We're on "users.view", so "list" keepAlive was never activated in this mount
      // — it should NOT be rendered (not even hidden)
      expect(screen.queryByTestId("stateful")).not.toBeInTheDocument();
      expect(screen.getByTestId("view")).toBeVisible();
    });

    it("should work with multiple RouteView at same level independently", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" keepAlive>
              <div data-testid="nav-users">Nav Users</div>
            </RouteView.Match>
            <RouteView.Match segment="about">
              <div data-testid="nav-about">Nav About</div>
            </RouteView.Match>
          </RouteView>
          <RouteView nodeName="">
            <RouteView.Match segment="users" keepAlive>
              <div data-testid="content-users">Content Users</div>
            </RouteView.Match>
            <RouteView.Match segment="about">
              <div data-testid="content-about">Content About</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("nav-users")).toBeVisible();
      expect(screen.getByTestId("content-users")).toBeVisible();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("nav-users")).not.toBeVisible();
      expect(screen.getByTestId("content-users")).not.toBeVisible();
      expect(screen.getByTestId("nav-about")).toBeVisible();
      expect(screen.getByTestId("content-about")).toBeVisible();
    });
  });

  describe("Deep nesting", () => {
    it("should render 3-level deep nested RouteView", async () => {
      const deepRouter = createRouter(
        [
          {
            name: "users",
            path: "/users",
            children: [
              {
                name: "profile",
                path: "/profile",
                children: [{ name: "settings", path: "/settings" }],
              },
            ],
          },
        ],
        { defaultRoute: "users" },
      );

      deepRouter.usePlugin(browserPluginFactory({}));
      await deepRouter.start("/users/profile/settings");

      render(
        <RouterProvider router={deepRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="level-1">Users</div>
              <RouteView nodeName="users">
                <RouteView.Match segment="profile">
                  <div data-testid="level-2">Profile</div>
                  <RouteView nodeName="users.profile">
                    <RouteView.Match segment="settings">
                      <div data-testid="level-3">Settings</div>
                    </RouteView.Match>
                  </RouteView>
                </RouteView.Match>
              </RouteView>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("level-1")).toBeInTheDocument();
      expect(screen.getByTestId("level-2")).toBeInTheDocument();
      expect(screen.getByTestId("level-3")).toBeInTheDocument();

      deepRouter.stop();
    });
  });

  describe("Suspense fallback", () => {
    it("should wrap children in Suspense when fallback is provided", async () => {
      const LazyComponent = lazy(() =>
        Promise.resolve({
          default: () => <div data-testid="lazy-content">Lazy Content</div>,
        }),
      );

      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match
              segment="users"
              fallback={<div data-testid="fallback">Loading...</div>}
            >
              <LazyComponent />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    it("should wrap children in Suspense inside Activity when both keepAlive and fallback are provided", async () => {
      const LazyComponent = lazy(() =>
        Promise.resolve({
          default: () => <div data-testid="lazy-keep">Lazy Keep</div>,
        }),
      );

      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match
              segment="list"
              keepAlive
              fallback={<div data-testid="spinner">Loading...</div>}
            >
              <LazyComponent />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      // Initially shows fallback inside Activity while lazy loads
      expect(screen.getByTestId("spinner")).toBeInTheDocument();

      // After lazy resolves, content is shown
      await expect(screen.findByTestId("lazy-keep")).resolves.toBeVisible();

      // Navigate away — content is hidden via Activity
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("lazy-keep")).toBeInTheDocument();
      expect(screen.getByTestId("lazy-keep")).not.toBeVisible();
      expect(screen.getByTestId("view")).toBeVisible();

      // Navigate back — content is visible again (preserved)
      await act(async () => {
        await router.navigate("users.list");
      });

      expect(screen.getByTestId("lazy-keep")).toBeVisible();
    });

    it("should not wrap children in Suspense when fallback is not provided", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="content">Content</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("content")).toBeInTheDocument();
      expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    });
  });

  describe("Flat RouteView re-renders on nested transitions — #519", () => {
    // Regression: flat `<RouteView nodeName="">` with dot-notated segments
    // (e.g. segment="users.view" exact) used to subscribe via
    // useRouteNode("") → createRouteNodeSource, which calls
    // shouldUpdateNode("") and returns false when a transition's
    // intersection is non-root (e.g. users → users.view, intersection="users").
    // Result: RouteView never re-rendered on such transitions and the wrong
    // Match stayed visible. Now RouteView subscribes via useRoute (RouteContext)
    // so every transition recomputes the active match.

    it("re-renders Match when navigating from parent to child (users → users.view)", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact>
              <div data-testid="users-list">UsersList</div>
            </RouteView.Match>
            <RouteView.Match segment="users.view" exact>
              <div data-testid="user-detail">UserDetail</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("user-detail")).not.toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
      expect(screen.getByTestId("user-detail")).toBeInTheDocument();
    });

    it("re-renders Match across sibling subtree transitions with a shared ancestor (users.view → users.edit)", async () => {
      await router.start("/users/1");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users.view" exact>
              <div data-testid="detail">UserDetail</div>
            </RouteView.Match>
            <RouteView.Match segment="users.edit" exact>
              <div data-testid="edit">UserEdit</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("detail")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      // intersection="users" — used to skip nodeName="" update and leave
      // UserDetail stale.
      expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
      expect(screen.getByTestId("edit")).toBeInTheDocument();
    });

    it("re-renders when navigating from child back up to parent (users.view → users)", async () => {
      await router.start("/users/1");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact>
              <div data-testid="list">UsersList</div>
            </RouteView.Match>
            <RouteView.Match segment="users.view" exact>
              <div data-testid="detail">UserDetail</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("detail")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users");
      });

      expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
      expect(screen.getByTestId("list")).toBeInTheDocument();
    });

    it("scoped RouteView (nodeName='users') still returns null when route is outside its subtree", async () => {
      await router.start("/about");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">UsersList</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("list")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("scoped RouteView (nodeName='users') renders when route enters its subtree", async () => {
      await router.start("/about");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">UsersList</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.queryByTestId("list")).not.toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(screen.getByTestId("list")).toBeInTheDocument();
    });

    it("scoped RouteView (nodeName='users') matches exact route (routeName === nodeName)", async () => {
      await router.start("/users");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="">
              <div data-testid="users-self">UsersSelf</div>
            </RouteView.Match>
            <RouteView.Match segment="list">
              <div data-testid="list">UsersList</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      // RouteView with nodeName="users" is active (routeName === nodeName),
      // even though no child Match matches (segment="" is never active).
      expect(screen.queryByTestId("list")).not.toBeInTheDocument();
      expect(screen.queryByTestId("users-self")).not.toBeInTheDocument();
    });
  });
});
