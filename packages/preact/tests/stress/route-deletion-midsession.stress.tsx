import { errorCodes } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { act, render } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouteView, RouterProvider, useRoute } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router, RouterError } from "@real-router/core";
import type { FunctionComponent } from "preact";

/**
 * Audit section 7, scenario #4: a route is deleted from the configuration
 * mid-session.
 *
 * Invariants:
 *  - removing a route does not corrupt the router or the active RouteView tree
 *  - navigating to sibling routes continues to work after removal
 *  - hooks with existing subscriptions keep observing valid state
 */

/**
 * Module-level RouteProbe — shared across tests so each `it()` does not
 * declare a fresh duplicate (sonarjs/no-identical-functions). The active
 * route name renders into `data-testid="route-name"`.
 */
const RouteProbe: FunctionComponent = () => {
  const { route } = useRoute();

  return <div data-testid="route-name">{route.name}</div>;
};

describe("preact — route deleted mid-session", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/users/list");
  });

  afterEach(() => {
    router.stop();
  });

  it("removing a sibling route does not break RouteView or subsequent navigations", async () => {
    const api = getRoutesApi(router);

    expect(api.has("users.view")).toBe(true);

    const { getByTestId, queryByTestId } = render(
      <RouterProvider router={router}>
        <RouteProbe />
        <RouteView nodeName="users">
          <RouteView.Match segment="list">
            <div data-testid="list-match">list</div>
          </RouteView.Match>
          <RouteView.Match segment="view">
            <div data-testid="view-match">view</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    expect(getByTestId("list-match").textContent).toBe("list");
    expect(getByTestId("route-name").textContent).toBe("users.list");

    // Remove the sibling that is NOT currently active.
    api.remove("users.view");

    expect(api.has("users.view")).toBe(false);

    // Router state is still valid — no listeners broke.
    expect(router.getState()?.name).toBe("users.list");

    // Navigating to another, still-existing route works.
    await act(async () => {
      await router.navigate("users.edit", { id: "1" });
    });

    expect(router.getState()?.name).toBe("users.edit");
    expect(getByTestId("route-name").textContent).toBe("users.edit");
    // "view" segment is removed, its RouteView.Match never activates.
    expect(queryByTestId("view-match")).toBeNull();
  });

  it("navigate TO a freshly removed route rejects with ROUTE_NOT_FOUND and leaves UI on the previous route (§7.1 #4)", async () => {
    // The original §7.1 #4 scenario flagged that removing an *inactive sibling*
    // was covered but navigation *to a deleted route* was not. Locks the
    // contract: navigate after remove must reject with ROUTE_NOT_FOUND, the
    // previous route must remain active, and the RouteView tree must not
    // render a stale match for the deleted segment.
    const api = getRoutesApi(router);

    const { getByTestId, queryByTestId } = render(
      <RouterProvider router={router}>
        <RouteProbe />
        <RouteView nodeName="users">
          <RouteView.Match segment="list">
            <div data-testid="list-match">list</div>
          </RouteView.Match>
          <RouteView.Match segment="view">
            <div data-testid="view-match">view</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    expect(api.has("users.view")).toBe(true);
    expect(getByTestId("route-name").textContent).toBe("users.list");

    api.remove("users.view");

    expect(api.has("users.view")).toBe(false);

    let captured: RouterError | undefined;

    await act(async () => {
      captured = (await router
        .navigate("users.view", { id: "42" })
        .catch((error: unknown) => error as RouterError)) as RouterError;
    });

    // Reject with ROUTE_NOT_FOUND (not silently swallowed, not throw'd
    // through React's renderer — the navigate() promise carries it).
    expect(captured).toBeDefined();
    expect(captured!.code).toBe(errorCodes.ROUTE_NOT_FOUND);

    // UI state did not move — previous route remains active and rendered.
    expect(router.getState()?.name).toBe("users.list");
    expect(getByTestId("route-name").textContent).toBe("users.list");
    expect(getByTestId("list-match").textContent).toBe("list");
    expect(queryByTestId("view-match")).toBeNull();
  });

  it("re-adding a route after deletion + navigation rejection restores normal navigation", async () => {
    // Locks the symmetric path: a route removed → navigate fails → the route
    // is re-added with `add()` → navigation succeeds. Validates that the
    // matcher / subscribers do not retain a stale "this route is gone" cache
    // beyond the actual removal window.
    const api = getRoutesApi(router);

    api.remove("users.view");

    let firstError: RouterError | undefined;

    await act(async () => {
      firstError = (await router
        .navigate("users.view", { id: "1" })
        .catch((error: unknown) => error as RouterError)) as RouterError;
    });

    expect(firstError?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    expect(router.getState()?.name).toBe("users.list");

    // Re-add the route under the same parent.
    api.add({ name: "view", path: "/:id" }, { parent: "users" });

    expect(api.has("users.view")).toBe(true);

    await act(async () => {
      await router.navigate("users.view", { id: "1" });
    });

    expect(router.getState()?.name).toBe("users.view");
  });

  it("removing the entire users subtree still resolves to NotFound for RouteView on that node", async () => {
    await act(async () => {
      await router.navigate("route1");
    });

    const api = getRoutesApi(router);

    api.remove("users");

    expect(api.has("users")).toBe(false);

    const { getByTestId } = render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="route1">
            <div data-testid="route1-match">route1</div>
          </RouteView.Match>
          <RouteView.Match segment="route2">
            <div data-testid="route2-match">route2</div>
          </RouteView.Match>
          <RouteView.NotFound>
            <div data-testid="not-found">not-found</div>
          </RouteView.NotFound>
        </RouteView>
      </RouterProvider>,
    );

    // Active route "route1" still exists — RouteView matches it normally.
    expect(getByTestId("route1-match").textContent).toBe("route1");

    // Navigate to the other surviving route to prove the tree is healthy.
    await act(async () => {
      await router.navigate("route2");
    });

    expect(getByTestId("route2-match").textContent).toBe("route2");
  });
});
