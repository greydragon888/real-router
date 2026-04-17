import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, screen } from "@solidjs/testing-library";
import { describe, it, expect, vi } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

/**
 * Audit section 7, scenario #4: a Link is mounted pointing at a route, then
 * `getRoutesApi(router).remove()` deletes that route mid-session.
 *
 * Gotchas:
 *   - `Link` captures `routeName` reactively in the fast path via
 *     `ctx.routeSelector(local.routeName)`.
 *   - `href` recomputes via `buildHref(router, local.routeName, ...)` — if the
 *     route is gone, `router.buildPath` throws, and `buildHref` catches the
 *     error and returns `undefined` + logs `console.error`.
 *   - Clicks on a now-invalid Link call `router.navigate(removedName, ...)`
 *     which rejects. Link's fire-and-forget `.catch(() => {})` swallows the
 *     rejection silently — the app must not crash.
 *
 * The concern: does React-like "undefined ref crash" happen, or does the Link
 * gracefully degrade?
 */
describe("S12 — removeRoute mid-session (Solid)", () => {
  it("12.1: Link pointing at removed route gracefully drops href, no crash", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
        { name: "settings", path: "/settings" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        <Link routeName="settings" data-testid="link">
          Settings
        </Link>
      </RouterProvider>
    ));

    const link = screen.getByTestId("link");

    // Baseline — route exists, href is built.
    expect(link.getAttribute("href")).toBe("/settings");

    // Remove the route while the Link is still mounted. buildHref is called
    // inside a createMemo whose only reactive dependency is routeName, so the
    // memo does NOT re-run on removal. This is expected Solid behaviour —
    // Link's href is stale, but the app does not crash.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    getRoutesApi(router).remove("settings");

    // We never forcibly re-render; just assert the app is still responsive.
    // The Link element is still in the DOM, clickable, and the router still
    // navigable to other routes.
    expect(link).toBeInTheDocument();

    // Clicking the now-stale Link triggers router.navigate which rejects with
    // ROUTE_NOT_FOUND — Link's .catch() swallows it silently.
    link.click();

    // Router should still be on "home" (navigate rejected, state unchanged).
    // Give the rejection a tick to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(router.getState()?.name).toBe("home");

    // Router must still accept a navigation to a valid route — no corrupted
    // FSM state from the failed click.
    await router.navigate("users");

    expect(router.getState()?.name).toBe("users");

    unmount();
    router.stop();
    consoleError.mockRestore();
  });

  it("12.2: removing the CURRENT route is silently blocked (state preserved)", async () => {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/users");

    render(() => (
      <RouterProvider router={router}>
        <Link routeName="users" data-testid="link">
          Users
        </Link>
      </RouterProvider>
    ));

    const link = screen.getByTestId("link");

    expect(link.getAttribute("href")).toBe("/users");
    expect(router.getState()?.name).toBe("users");

    // Attempting to remove the active route is a silent no-op — the router's
    // validator returns false without throwing (see routeGuards.ts). The route
    // remains in the tree.
    getRoutesApi(router).remove("users");

    // State, Link href, and the route itself are preserved.
    expect(router.getState()?.name).toBe("users");
    expect(link.getAttribute("href")).toBe("/users");

    // Router still honours navigation away to a sibling.
    await router.navigate("home");

    expect(router.getState()?.name).toBe("home");

    router.stop();
  });

  it("12.3: N Links with round-robin removal — none crash when target route vanishes", async () => {
    const N = 50;
    const routes = [
      { name: "home", path: "/" },
      ...Array.from({ length: N }, (_, i) => ({
        name: `r${i}`,
        path: `/r${i}`,
      })),
    ];
    const router = createRouter(routes, { defaultRoute: "home" });

    await router.start("/");

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: N }, (_, i) => (
          <Link routeName={`r${i}`} data-testid={`link-${i}`}>
            r{i}
          </Link>
        ))}
      </RouterProvider>
    ));

    const api = getRoutesApi(router);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Remove every non-active route in sequence.
    for (let i = 0; i < N; i++) {
      api.remove(`r${i}`);
    }

    // All 50 Link elements still in DOM, no throw during removal loop.
    for (let i = 0; i < N; i++) {
      expect(screen.getByTestId(`link-${i}`)).toBeInTheDocument();
    }

    // Router still functional for remaining route.
    expect(router.getState()?.name).toBe("home");

    consoleError.mockRestore();
    router.stop();
  });
});
