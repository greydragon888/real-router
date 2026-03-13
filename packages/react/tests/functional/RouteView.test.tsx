import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
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

      expect(setupAfterMount).toBeGreaterThan(0);

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
});
