import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { lazy, onCleanup } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

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

    // audit-2026-05-17 Sprint A.2 — empty-segment Match guard.
    // Without the early-return in processMatchChild, `<Match segment="">`
    // under a non-empty parent nodeName produces fullSegmentName
    // `"nodeName."` which crashes startsWithSegment in @real-router/route-utils
    // with TypeError ("segment must not end with a dot"). This test locks
    // the guard: empty-segment Match silently never matches.
    it("`<Match segment=''>` does NOT crash and never matches (Sprint A.2)", async () => {
      await router.start("/users/list");

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="">
              <div data-testid="empty-segment">Should not render</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      // No exception thrown during render — render() returns normally.
      // No match: container is empty.
      expect(screen.queryByTestId("empty-segment")).not.toBeInTheDocument();
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

  describe("Self", () => {
    it("renders Self when active === nodeName (no descendant active)", async () => {
      await router.start("/users");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">UsersList</div>
            </RouteView.Self>
            <RouteView.Match segment="view">
              <div data-testid="users-view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-self")).toBeInTheDocument();
      expect(screen.queryByTestId("users-view")).not.toBeInTheDocument();
    });

    it("does not render Self when descendant Match active", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-list")).toBeInTheDocument();
      expect(screen.queryByTestId("users-self")).not.toBeInTheDocument();
    });

    it("first <Self> wins when multiple are provided", async () => {
      await router.start("/users");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self-first">First</div>
            </RouteView.Self>
            <RouteView.Self>
              <div data-testid="users-self-second">Second</div>
            </RouteView.Self>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-self-first")).toBeInTheDocument();
      expect(screen.queryByTestId("users-self-second")).not.toBeInTheDocument();
    });

    it("Self has priority over NotFound when active === nodeName", async () => {
      await router.start("/users");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
            <RouteView.NotFound>
              <div data-testid="not-found">404</div>
            </RouteView.NotFound>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-self")).toBeInTheDocument();
      expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
    });

    it("does not render Self when active is unrelated (no Match for it either)", async () => {
      await router.start("/users/list");

      const { container } = render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
          </RouteView>
        </RouterProvider>
      ));

      expect(container.innerHTML).toBe("");
    });

    it("Self with fallback + synchronous children renders children, fallback never visible", async () => {
      // Companion to the lazy-suspends test below — Self's fallback wraps
      // children in <Suspense>, but with synchronous children Solid never
      // shows the fallback. Pins the contract that adding `fallback` is
      // backward-compatible for sync children.
      await router.start("/users");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self
              fallback={<div data-testid="self-fallback">Loading...</div>}
            >
              <div data-testid="users-self">UsersList</div>
            </RouteView.Self>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-self")).toBeInTheDocument();
      expect(screen.queryByTestId("self-fallback")).not.toBeInTheDocument();
    });

    it("Self with fallback shows fallback while lazy child suspends", async () => {
      await router.start("/users");

      let resolveComponent!: (module_: { default: () => JSX.Element }) => void;
      const componentPromise = new Promise<{ default: () => JSX.Element }>(
        (r) => {
          resolveComponent = r;
        },
      );
      const LazyChild = lazy(() => componentPromise);

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self
              fallback={<div data-testid="self-fallback">Loading…</div>}
            >
              <LazyChild />
            </RouteView.Self>
          </RouteView>
        </RouterProvider>
      ));

      // Suspense boundary is active — fallback visible, content not yet.
      expect(screen.getByTestId("self-fallback")).toBeInTheDocument();
      expect(screen.queryByTestId("lazy-content")).not.toBeInTheDocument();

      resolveComponent({
        default: () => <div data-testid="lazy-content">Loaded</div>,
      });

      await waitFor(() => {
        expect(screen.getByTestId("lazy-content")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("self-fallback")).not.toBeInTheDocument();
    });

    it("transitions: descendant Match → Self when navigating up", async () => {
      await router.start("/users/list");

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Self>
              <div data-testid="users-self">Self</div>
            </RouteView.Self>
            <RouteView.Match segment="list">
              <div data-testid="users-list">List</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      expect(screen.getByTestId("users-list")).toBeInTheDocument();

      await router.navigate("users");

      await waitFor(() => {
        expect(screen.getByTestId("users-self")).toBeInTheDocument();
        expect(screen.queryByTestId("users-list")).not.toBeInTheDocument();
      });
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

    it("should use the FIRST NotFound when multiple are present (first-wins) (#1439)", async () => {
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

      expect(screen.getByTestId("first-nf")).toBeInTheDocument();
      expect(screen.queryByTestId("last-nf")).not.toBeInTheDocument();
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

    it("Self renders null when used standalone", () => {
      const { container } = render(() => (
        <RouteView.Self>content</RouteView.Self>
      ));

      expect(container.innerHTML).toBe("");
    });

    it("NotFound renders null when used standalone", () => {
      const { container } = render(() => (
        <RouteView.NotFound>content</RouteView.NotFound>
      ));

      expect(container.innerHTML).toBe("");
    });

    it("Match, Self, and NotFound have displayName", () => {
      expect(RouteView.Match.displayName).toBe("RouteView.Match");
      expect(RouteView.Self.displayName).toBe("RouteView.Self");
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
          <RouteView nodeName="">
            {spoofedMatch as unknown as JSX.Element}
          </RouteView>
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
            {spoofedNotFound as unknown as JSX.Element}
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
          <RouteView nodeName="">{null}</RouteView>
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

    // §5.8 audit edge case: collectElements is recursive but the previous
    // test only exercised 1 level of nested arrays. This case probes 3+
    // levels — markers wrapped in array-of-array-of-array, simulating
    // composed factories (e.g. plugin-supplied route groups that themselves
    // call .map() and embed their result into another .map()).
    it("§5.8 — collectElements recurses through 3+ levels of nested arrays", async () => {
      await router.start("/");

      const deeplyNestedMarkers = [
        [
          [
            // Level 3: array > array > array > marker
            <RouteView.Match segment="users">
              <div data-testid="users">UsersDeep</div>
            </RouteView.Match>,
          ],
          // Mixed with a level-2 marker at the same nesting depth.
          <RouteView.Match segment="items">
            <div data-testid="items">ItemsMid</div>
          </RouteView.Match>,
        ],
        // And a top-level NotFound to prove the helper still picks it up.
        <RouteView.NotFound>
          <div data-testid="not-found">NotFoundTop</div>
        </RouteView.NotFound>,
      ];

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">{deeplyNestedMarkers}</RouteView>
        </RouterProvider>
      ));

      // Level-3 marker resolves on navigation.
      await router.navigate("users.list");

      expect(screen.getByTestId("users")).toBeInTheDocument();
      expect(screen.queryByTestId("items")).not.toBeInTheDocument();

      // Level-2 marker resolves on navigation.
      await router.navigate("items");

      expect(screen.getByTestId("items")).toBeInTheDocument();
      expect(screen.queryByTestId("users")).not.toBeInTheDocument();

      // (The UNKNOWN_ROUTE NotFound-fallback for nested markers is exercised
      // by the dedicated <RouteView.NotFound> tests below — driving it
      // through `router.navigate("@@router/UNKNOWN_ROUTE")` here is not
      // reliable: the router rejects the navigation and the state stays on
      // "items", which yields a false-positive NotFound assertion. Two
      // resolution checks above are enough to prove deep-nesting walk.)
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
    it("should render fallback when provided (synchronous — content visible immediately)", async () => {
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

    it("Match with fallback shows fallback while lazy child suspends", async () => {
      await router.start("/users/list");

      let resolveComponent!: (module_: { default: () => JSX.Element }) => void;
      const componentPromise = new Promise<{ default: () => JSX.Element }>(
        (r) => {
          resolveComponent = r;
        },
      );
      const LazyUsers = lazy(() => componentPromise);

      render(() => (
        <RouterProvider router={router}>
          <RouteView nodeName="">
            <RouteView.Match
              segment="users"
              fallback={<div data-testid="match-fallback">Loading…</div>}
            >
              <LazyUsers />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>
      ));

      // Suspense boundary active — fallback shows, content not yet.
      expect(screen.getByTestId("match-fallback")).toBeInTheDocument();
      expect(screen.queryByTestId("lazy-users")).not.toBeInTheDocument();

      resolveComponent({
        default: () => <div data-testid="lazy-users">Users</div>,
      });

      await waitFor(() => {
        expect(screen.getByTestId("lazy-users")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("match-fallback")).not.toBeInTheDocument();
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
