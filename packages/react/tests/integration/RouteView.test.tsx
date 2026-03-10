import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { render, screen, act, waitFor } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

describe("RouteView - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Nested RouteView", () => {
    const NestedApp: FC = () => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users">
            <RouteView nodeName="users">
              <RouteView.Match segment="list">
                <div data-testid="users-list">Users List</div>
              </RouteView.Match>
              <RouteView.Match segment="view">
                <div data-testid="users-view">Users View</div>
              </RouteView.Match>
              <RouteView.Match segment="edit">
                <div data-testid="users-edit">Users Edit</div>
              </RouteView.Match>
            </RouteView>
          </RouteView.Match>
          <RouteView.Match segment="about">
            <div data-testid="about">About</div>
          </RouteView.Match>
          <RouteView.Match segment="home">
            <div data-testid="home">Home</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    );

    it("should render correct nested chain", async () => {
      await router.start("/users/list");

      render(<NestedApp />);

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("users-view")).not.toBeInTheDocument();
      expect(screen.queryByTestId("about")).not.toBeInTheDocument();
    });

    it("should switch Match at root level on navigation", async () => {
      await router.start("/users/list");

      render(<NestedApp />);

      expect(screen.getByTestId("users-list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
      expect(screen.getByTestId("about")).toBeInTheDocument();
    });

    it("should switch nested Match on navigation", async () => {
      await router.start("/users/list");

      render(<NestedApp />);

      expect(screen.getByTestId("users-list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
      expect(screen.getByTestId("users-view")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      expect(screen.queryByTestId("users-view")).not.toBeInTheDocument();
      expect(screen.getByTestId("users-edit")).toBeInTheDocument();
    });

    it("should handle full navigation chain: nested → root → nested", async () => {
      await router.start("/users/list");

      render(<NestedApp />);

      expect(screen.getByTestId("users-list")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("about")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.view", { id: "42" });
      });

      expect(screen.queryByTestId("about")).not.toBeInTheDocument();
      expect(screen.getByTestId("users-view")).toBeInTheDocument();
    });
  });

  describe("NotFound with allowNotFound", () => {
    let notFoundRouter: Router;

    beforeEach(() => {
      notFoundRouter = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home", allowNotFound: true },
      );
      notFoundRouter.usePlugin(browserPluginFactory({}));
    });

    afterEach(() => {
      notFoundRouter.stop();
    });

    it("should render NotFound when navigating to unknown route", async () => {
      await notFoundRouter.start("/non-existent");

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

      expect(screen.getByTestId("not-found")).toBeInTheDocument();
      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
    });
  });

  describe("Multiple RouteView at same level", () => {
    it("should work independently", async () => {
      await router.start("/users/list");

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="nav-users">Nav Users</div>
            </RouteView.Match>
            <RouteView.Match segment="about">
              <div data-testid="nav-about">Nav About</div>
            </RouteView.Match>
          </RouteView>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="content-users">Content Users</div>
            </RouteView.Match>
            <RouteView.Match segment="about">
              <div data-testid="content-about">Content About</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("nav-users")).toBeInTheDocument();
      expect(screen.getByTestId("content-users")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("nav-about")).toBeInTheDocument();
      expect(screen.getByTestId("content-about")).toBeInTheDocument();
    });
  });

  describe("React.lazy + Suspense", () => {
    it("should render Suspense fallback then lazy component", async () => {
      await router.start("/users/list");

      const LazyComponent = lazy(() =>
        Promise.resolve({
          default: () => <div data-testid="lazy-content">Lazy Content</div>,
        }),
      );

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                <LazyComponent />
              </Suspense>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("lazy-content")).toBeInTheDocument();
      });
    });
  });

  describe("Component integration", () => {
    it("should work with useRouteNode inside matched children", async () => {
      await router.start("/users/list");

      const UsersList: FC = () => (
        <div data-testid="inner-list">Inner List</div>
      );

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <UsersList />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("inner-list")).toBeInTheDocument();
    });

    it("should handle complex nested structure with wrapper components", async () => {
      await router.start("/users/list");

      const Layout: FC<{ children: ReactNode }> = ({ children }) => (
        <div data-testid="layout">{children}</div>
      );

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <Layout>
                <RouteView nodeName="users">
                  <RouteView.Match segment="list">
                    <div data-testid="nested-list">Nested List</div>
                  </RouteView.Match>
                </RouteView>
              </Layout>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(screen.getByTestId("layout")).toBeInTheDocument();
      expect(screen.getByTestId("nested-list")).toBeInTheDocument();
    });
  });

  describe("Nested RouteView with keepAlive", () => {
    const NestedKeepAliveApp: FC = () => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users" keepAlive>
            <RouteView nodeName="users">
              <RouteView.Match segment="list" keepAlive>
                <div data-testid="users-list">Users List</div>
              </RouteView.Match>
              <RouteView.Match segment="view">
                <div data-testid="users-view">Users View</div>
              </RouteView.Match>
            </RouteView>
          </RouteView.Match>
          <RouteView.Match segment="about">
            <div data-testid="about">About</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    );

    it("should unmount inner content when navigating to different root segment", async () => {
      await router.start("/users/list");

      render(<NestedKeepAliveApp />);

      expect(screen.getByTestId("users-list")).toBeVisible();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
      expect(screen.getByTestId("about")).toBeVisible();
    });

    it("should preserve inner keepAlive when navigating between child segments", async () => {
      await router.start("/users/list");

      render(<NestedKeepAliveApp />);

      expect(screen.getByTestId("users-list")).toBeVisible();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("users-list")).not.toBeVisible();
      expect(screen.getByTestId("users-view")).toBeVisible();
    });

    it("should restore full nested chain on return navigation", async () => {
      await router.start("/users/list");

      render(<NestedKeepAliveApp />);

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("about")).toBeVisible();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(screen.queryByTestId("about")).not.toBeInTheDocument();
      expect(screen.getByTestId("users-list")).toBeVisible();
    });
  });
});
