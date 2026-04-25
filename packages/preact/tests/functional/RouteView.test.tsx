import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen, act, fireEvent } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ComponentChildren } from "preact";

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

    it("should not match when the segment prop is empty (guard against boundary edge case)", async () => {
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

    it("does not render Self when active route is unrelated to nodeName", async () => {
      await router.start("/users/list");

      const { container } = render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
          </RouteView>
        </RouterProvider>,
      );

      expect(container.innerHTML).toBe("");
    });

    it("position-independent: Self before Match still ignored when descendant active", async () => {
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

    it("transitions from Match to Self when navigating to parent", async () => {
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
          <RouteView nodeName="">
            {null as unknown as ComponentChildren}
          </RouteView>
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

    it("should lose component state when Match changes (no keepAlive)", async () => {
      const { useState } = await import("preact/hooks");

      const CounterComponent = () => {
        const [count, setCount] = useState(0);

        return (
          <div>
            <div data-testid="counter">{count}</div>
            <button
              data-testid="increment"
              onClick={() => {
                setCount(count + 1);
              }}
            >
              Increment
            </button>
          </div>
        );
      };

      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <CounterComponent />
            </RouteView.Match>
            <RouteView.Match segment="about">
              <div data-testid="about">About</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("counter")).toHaveTextContent("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("increment"));
      });

      expect(screen.getByTestId("counter")).toHaveTextContent("1");

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.queryByTestId("counter")).not.toBeInTheDocument();
      expect(screen.getByTestId("about")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(screen.getByTestId("counter")).toHaveTextContent("0");
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
      const { lazy } = await import("preact/compat");

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
});
