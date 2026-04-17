import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { onCleanup } from "solid-js";
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

    // Audit section 5.2: markers are identified by local Symbol, not Symbol.for().
    // An object forged with `Symbol.for("RouteView.Match")` must NOT pass
    // collectElements' marker check.
    it("rejects spoofed marker built via Symbol.for()", async () => {
      await router.start("/users/list");

      const spoofedMatch = {
        $$type: Symbol.for("RouteView.Match"),
        segment: "users",
        exact: false,
        fallback: undefined,
        children: <div data-testid="spoofed">SPOOFED</div>,
      };

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">{spoofedMatch as unknown as null}</RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("spoofed")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
    });

    it("rejects spoofed NotFound marker built via Symbol.for()", async () => {
      await router.start("/definitely-not-a-route");

      const spoofedNotFound = {
        $$type: Symbol.for("RouteView.NotFound"),
        children: <div data-testid="spoofed-nf">SPOOFED-NF</div>,
      };

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            {spoofedNotFound as unknown as null}
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.queryByTestId("spoofed-nf")).not.toBeInTheDocument();
      expect(container.innerHTML).toBe("");
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

    // Edge case from audit section 5.3: collectElements recursively descends
    // into arrays (e.g. produced by .map()). Arrays mixed with null entries
    // are a common JSX pattern — verify both markers still participate.
    it("collectElements handles nested array of markers from map() with conditional null", async () => {
      await router.start("/");

      const routeDefs: ({ segment: string; testId: string } | null)[] = [
        { segment: "users", testId: "users" },
        null,
        { segment: "items", testId: "items" },
        null,
      ];

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            {routeDefs.map((def) =>
              def ? (
                <RouteView.Match segment={def.segment}>
                  <div data-testid={def.testId}>{def.segment}</div>
                </RouteView.Match>
              ) : null,
            )}
          </RouteView>
        </RouterProvider>
      ));

      await router.navigate("users.list");

      expect(screen.getByTestId("users")).toBeInTheDocument();
      expect(screen.queryByTestId("items")).not.toBeInTheDocument();

      await router.navigate("items");

      expect(screen.getByTestId("items")).toBeInTheDocument();
      expect(screen.queryByTestId("users")).not.toBeInTheDocument();
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

      render(() => (
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
        </RouterProvider>
      ));

      expect(screen.getByTestId("level-1")).toBeInTheDocument();
      expect(screen.getByTestId("level-2")).toBeInTheDocument();
      expect(screen.getByTestId("level-3")).toBeInTheDocument();

      deepRouter.stop();
    });
  });

  // Documents gotcha #9 "No keepAlive" from packages/solid/CLAUDE.md:
  //   RouteView renders only the active match. On navigation, the previous
  //   component disposes completely — state is lost.
  describe("No keepAlive (gotcha #9)", () => {
    it("disposes inactive match — onCleanup fires when navigating away", async () => {
      await router.start("/users/list");

      let userPageCleanupCount = 0;

      function UsersPage() {
        onCleanup(() => {
          userPageCleanupCount++;
        });

        return <div data-testid="users">Users</div>;
      }

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match segment="users">
              <UsersPage />
            </RouteView.Match>
            <RouteView.Match segment="items">
              <div data-testid="items">Items</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users")).toBeInTheDocument();
      expect(userPageCleanupCount).toBe(0);

      await router.navigate("items");

      await waitFor(() => {
        expect(screen.queryByTestId("users")).not.toBeInTheDocument();
      });

      expect(userPageCleanupCount).toBe(1);

      await router.navigate("users.list");

      await waitFor(() => {
        expect(screen.getByTestId("users")).toBeInTheDocument();
      });

      expect(userPageCleanupCount).toBe(1);
    });
  });

  describe("Suspense fallback", () => {
    it("should render fallback when provided", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match
              segment="users"
              fallback={<div data-testid="fallback">Loading...</div>}
            >
              <div data-testid="users">Users</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users")).toBeInTheDocument();
    });

    it("should not render fallback when no fallback prop", async () => {
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
      expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    });
  });
});
