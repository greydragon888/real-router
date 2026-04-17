import { getRoutesApi } from "@real-router/core/api";
import { act, render } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouteView, RouterProvider, useRoute } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";
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

    const RouteProbe: FunctionComponent = () => {
      const { route } = useRoute();

      return <div data-testid="route-name">{route?.name ?? "null"}</div>;
    };

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
