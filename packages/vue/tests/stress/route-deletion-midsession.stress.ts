/**
 * Stress tests for route removal mid-session (§7.1 #4, LOW).
 *
 * Closes the §7.1 #4 review item: "traverseToLast к удалённому route
 * mid-session — LOW (mid-session route mutation редкий)."
 *
 * Adaptation note — Vue uses `@real-router/browser-plugin`, which does NOT
 * expose `traverseToLast` (that API lives only in `navigation-plugin`).
 * The original Preact test exercises route removal via
 * `getRoutesApi(router).remove(...)` followed by navigation to the
 * removed route. That alternative recovery path applies identically here.
 *
 * Counterpart: `packages/preact/tests/stress/route-deletion-midsession.stress.tsx`.
 *
 * Invariants:
 *  - removing an inactive sibling route does not corrupt the router or
 *    RouteView tree;
 *  - navigating TO a freshly-removed route rejects with `ROUTE_NOT_FOUND`
 *    and leaves the previous route active;
 *  - re-adding the route after rejection restores normal navigation;
 *  - removing the entire subtree containing the previously-active route
 *    is recoverable via navigation to a sibling.
 */

import { errorCodes } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { createStressRouter } from "./helpers";
import { RouteView } from "../../src/components/RouteView";
import { useRoute } from "../../src/composables/useRoute";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router, RouterError } from "@real-router/core";

const RouteProbe = defineComponent({
  name: "RouteProbe",
  setup() {
    const { route } = useRoute();

    return () => h("div", { "data-testid": "route-name" }, route.value.name);
  },
});

function mountWithProvider(
  router: Router,
  content: () => unknown,
): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      setup: () => () => h(RouterProvider, { router }, { default: content }),
    }),
  );
}

describe("§7.1 #4 — route deleted mid-session (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/users/list");
  });

  afterEach(() => {
    router.stop();
  });

  it("4.1: removing a sibling route does not break RouteView or subsequent navigations", async () => {
    const api = getRoutesApi(router);

    expect(api.has("users.view")).toBe(true);

    const wrapper = mountWithProvider(router, () => [
      h(RouteProbe),
      h(
        RouteView,
        { nodeName: "users" },
        {
          default: () => [
            h(
              RouteView.Match,
              { segment: "list" },
              {
                default: () =>
                  h("div", { "data-testid": "list-match" }, "list"),
              },
            ),
            h(
              RouteView.Match,
              { segment: "view" },
              {
                default: () =>
                  h("div", { "data-testid": "view-match" }, "view"),
              },
            ),
          ],
        },
      ),
    ]);

    expect(wrapper.find("[data-testid='list-match']").text()).toBe("list");
    expect(wrapper.find("[data-testid='route-name']").text()).toBe(
      "users.list",
    );

    // Remove the sibling that is NOT currently active.
    api.remove("users.view");

    expect(api.has("users.view")).toBe(false);

    // Router state is still valid — no listeners broke.
    expect(router.getState()?.name).toBe("users.list");

    // Navigating to another, still-existing route works.
    await router.navigate("users.edit", { id: "1" });
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("users.edit");
    expect(wrapper.find("[data-testid='route-name']").text()).toBe(
      "users.edit",
    );
    expect(wrapper.find("[data-testid='view-match']").exists()).toBe(false);

    wrapper.unmount();
  });

  it("4.2: navigate TO a freshly removed route rejects with ROUTE_NOT_FOUND and leaves UI on the previous route", async () => {
    const api = getRoutesApi(router);
    const wrapper = mountWithProvider(router, () => [
      h(RouteProbe),
      h(
        RouteView,
        { nodeName: "users" },
        {
          default: () => [
            h(
              RouteView.Match,
              { segment: "list" },
              {
                default: () =>
                  h("div", { "data-testid": "list-match" }, "list"),
              },
            ),
            h(
              RouteView.Match,
              { segment: "view" },
              {
                default: () =>
                  h("div", { "data-testid": "view-match" }, "view"),
              },
            ),
          ],
        },
      ),
    ]);

    expect(api.has("users.view")).toBe(true);
    expect(wrapper.find("[data-testid='route-name']").text()).toBe(
      "users.list",
    );

    api.remove("users.view");

    expect(api.has("users.view")).toBe(false);

    const captured = (await router
      .navigate("users.view", { id: "42" })
      .catch((error: unknown) => error)) as RouterError;

    await nextTick();
    await flushPromises();

    expect(captured.code).toBe(errorCodes.ROUTE_NOT_FOUND);

    // UI state did not move — previous route remains active and rendered.
    expect(router.getState()?.name).toBe("users.list");
    expect(wrapper.find("[data-testid='route-name']").text()).toBe(
      "users.list",
    );
    expect(wrapper.find("[data-testid='list-match']").text()).toBe("list");
    expect(wrapper.find("[data-testid='view-match']").exists()).toBe(false);

    wrapper.unmount();
  });

  it("4.3: re-adding a route after deletion + navigation rejection restores normal navigation", async () => {
    const api = getRoutesApi(router);

    api.remove("users.view");

    const firstError = (await router
      .navigate("users.view", { id: "1" })
      .catch((error: unknown) => error)) as RouterError;

    expect(firstError.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    expect(router.getState()?.name).toBe("users.list");

    // Re-add the route under the same parent.
    api.add({ name: "view", path: "/:id" }, { parent: "users" });

    expect(api.has("users.view")).toBe(true);

    await router.navigate("users.view", { id: "1" });

    expect(router.getState()?.name).toBe("users.view");
  });

  it("4.4: removing the entire users subtree still resolves to other sibling routes", async () => {
    await router.navigate("route1");
    await nextTick();
    await flushPromises();

    const api = getRoutesApi(router);

    api.remove("users");

    expect(api.has("users")).toBe(false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouteView,
        { nodeName: "" },
        {
          default: () => [
            h(
              RouteView.Match,
              { segment: "route1" },
              {
                default: () =>
                  h("div", { "data-testid": "route1-match" }, "route1"),
              },
            ),
            h(
              RouteView.Match,
              { segment: "route2" },
              {
                default: () =>
                  h("div", { "data-testid": "route2-match" }, "route2"),
              },
            ),
            h(RouteView.NotFound, null, {
              default: () =>
                h("div", { "data-testid": "not-found" }, "not-found"),
            }),
          ],
        },
      ),
    );

    // Active route "route1" still exists — RouteView matches it normally.
    expect(wrapper.find("[data-testid='route1-match']").text()).toBe("route1");

    // Navigate to the other surviving route to prove the tree is healthy.
    await router.navigate("route2");
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='route2-match']").text()).toBe("route2");

    wrapper.unmount();
  });

  it("4.5: removed-route navigation × 30 cycles — every rejection stays clean, router never zombies", async () => {
    // Sustained burst: remove → fail-navigate → re-add → success-navigate
    // × 30 cycles. Verifies the FSM + matcher cache do not drift.
    const api = getRoutesApi(router);

    for (let i = 0; i < 30; i++) {
      api.remove("users.view");

      const error = (await router
        .navigate("users.view", { id: String(i) })
        .catch((error_: unknown) => error_)) as RouterError;

      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(router.getState()?.name).toBe("users.list");

      api.add({ name: "view", path: "/:id" }, { parent: "users" });

      await router.navigate("users.view", { id: String(i) });

      expect(router.getState()?.name).toBe("users.view");

      // Reset back to list for the next cycle.
      await router.navigate("users.list");
    }
  });
});
