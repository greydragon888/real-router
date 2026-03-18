import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

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

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should return null if no match", async () => {
      await router.start("/about");

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should support exact matching — matches exact route only", async () => {
      await router.start("/users");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact>
              <div data-testid="users-exact">Users Exact</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-exact")).toBeInTheDocument();
    });

    it("should support exact matching — does not match descendants", async () => {
      await router.start("/users/list");

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users" exact>
              <div data-testid="users-exact">Users Exact</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("users-exact")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should support startsWith matching by default", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users")).toBeInTheDocument();

      await router.navigate("users.view", { id: "1" });

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should render first Match on multiple matches", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="first">First</div>
            </RouteView.Match>
            <RouteView.Match segment="users">
              <div data-testid="second">Second</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("first")).toBeInTheDocument();
      expect(screen.queryByTestId("second")).not.toBeInTheDocument();
    });

    it("should correctly build fullSegmentName for nested RouteView", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="users-view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("users-view")).not.toBeInTheDocument();

      await router.navigate("users.view", { id: "1" });

      await waitFor(() => {
        expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
        expect(screen.getByTestId("users-view")).toBeInTheDocument();
      });
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

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

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

      render(() => (
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="not-found">Not Found</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });

    it("should not render NotFound for regular routes without match", async () => {
      await router.start("/about");

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
            <RouteView.NotFound>
              <div data-testid="not-found">Not Found</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("should use last NotFound when multiple are present", async () => {
      await notFoundRouter.start("/non-existent-path");

      render(() => (
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
        </RouterProvider>
      ));

      expect(screen.queryByTestId("first-nf")).not.toBeInTheDocument();
      expect(screen.getByTestId("last-nf")).toBeInTheDocument();
    });

    it("should work with NotFound only (no Match)", async () => {
      await notFoundRouter.start("/non-existent-path");

      render(() => (
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.NotFound>
              <div data-testid="not-found">Not Found</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });

    it("should return null on UNKNOWN_ROUTE without NotFound", async () => {
      await notFoundRouter.start("/non-existent-path");

      const { container } = render(() => (
        <RouterProvider router={notFoundRouter}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });
  });

  describe("Marker components", () => {
    it("Match renders null when used standalone", () => {
      const { container } = render(() => (
        <RouteView.Match segment="x">content</RouteView.Match>
      ));

      expect(container.innerHTML).toBe("");
    });

    it("NotFound renders null when used standalone", () => {
      const { container } = render(() => (
        <RouteView.NotFound>content</RouteView.NotFound>
      ));

      expect(container.innerHTML).toBe("");
    });

    it("Match and NotFound have displayName", () => {
      expect(RouteView.Match.displayName).toBe("RouteView.Match");
      expect(RouteView.NotFound.displayName).toBe("RouteView.NotFound");
    });
  });

  describe("State", () => {
    it("should return null if route is undefined (router not started)", () => {
      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });
  });

  describe("Children handling", () => {
    it("should ignore non-Match/non-NotFound children", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            {"some string"}
            {null}
            <RouteView.Match segment="users">
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should return null for empty RouteView", async () => {
      await router.start("/users/list");

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">{null as unknown as any}</RouteView>
        </RouterProvider>
      ));

      expect(container.innerHTML).toBe("");
    });
  });

  describe("Re-renders", () => {
    it("should re-render when navigating within nodeName", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("list")).toBeInTheDocument();

      await router.navigate("users.view", { id: "1" });

      await waitFor(() => {
        expect(screen.queryByTestId("list")).not.toBeInTheDocument();
        expect(screen.getByTestId("view")).toBeInTheDocument();
      });
    });

    it("should not re-render when navigating outside nodeName", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("list")).toBeInTheDocument();

      await router.navigate("about");

      await waitFor(() => {
        expect(screen.queryByTestId("list")).not.toBeInTheDocument();
      });
    });
  });
});
