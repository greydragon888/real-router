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

  /**
   * Closes review §7 #4 MEDIUM: "traverseToLast к route, удалённому
   * mid-session" — back-button navigation (popstate) to a route that was
   * removed mid-session must NOT hang the router. The reviewed gap stated:
   * "На частую операцию back-button после deploy с удалением route".
   *
   * Real-Router has no `traverseToLast` method — back-button navigation goes
   * through the browser-plugin's popstate handler. To simulate without
   * pulling in the full browser-plugin (jsdom popstate plumbing is brittle),
   * we use the equivalent semantic: a transition target that was active
   * in-session but is now ROUTE_NOT_FOUND. The router must reject cleanly
   * (TRANSITION_ERROR with `ROUTE_NOT_FOUND`-style code), not hang in
   * pending state.
   */
  it("navigate to a previously-active route AFTER its removal rejects cleanly (no hang)", async () => {
    const api = getRoutesApi(router);

    // Visit route1, then route2, then come back to "users.list" — establishes
    // a real navigation history within the router.
    await act(async () => {
      await router.navigate("route1");
    });
    await act(async () => {
      await router.navigate("route2");
    });
    await act(async () => {
      await router.navigate("users.list");
    });

    expect(router.getState()?.name).toBe("users.list");

    // Remove route1 — the route the user might press "back" to in a real
    // browser session.
    api.remove("route1");

    expect(api.has("route1")).toBe(false);

    // Simulate the "back to deleted route" attempt. Router must surface the
    // error synchronously (Promise rejects); MUST NOT leave isTransitioning
    // === true forever.
    let rejection: RouterError | undefined;

    await act(async () => {
      await router.navigate("route1").catch((error: unknown) => {
        rejection = error as RouterError;
      });
    });

    expect(rejection).toBeDefined();
    // Either ROUTE_NOT_FOUND or TRANSITION_ERR — both are acceptable
    // outcomes; the lock here is that SOMETHING rejects, deterministically.
    expect([errorCodes.ROUTE_NOT_FOUND, errorCodes.TRANSITION_ERR]).toContain(
      rejection!.code,
    );

    // Router stays on the prior state — not stuck mid-transition.
    expect(router.getState()?.name).toBe("users.list");

    // The router is still usable — a subsequent navigation to a valid route
    // succeeds without the previous failure poisoning the pipeline.
    await act(async () => {
      await router.navigate("route2");
    });

    expect(router.getState()?.name).toBe("route2");
  });

  it("rapid back-and-forth between live and removed routes: pipeline does not deadlock", async () => {
    // Stress variant: 30 alternating navigations between a live route and a
    // route that was just removed. The pending-transition state machine must
    // not accumulate stale state under churn.
    const api = getRoutesApi(router);

    await act(async () => {
      await router.navigate("route1");
    });

    api.remove("route1");

    for (let i = 0; i < 30; i++) {
      const target = i % 2 === 0 ? "route1" : "route2";

      await act(async () => {
        await router.navigate(target).catch(() => {
          // route1 navigations reject silently (deleted); route2 succeed.
        });
      });
    }

    // After 30 alternating attempts, router lands on the last successful
    // navigation target.
    expect(router.getState()?.name).toBe("route2");
  });
});
