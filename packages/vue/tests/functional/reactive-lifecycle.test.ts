import { mount, flushPromises } from "@vue/test-utils";
import { describe, afterEach, it, expect } from "vitest";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";

import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { useRouteNode } from "../../src/composables/useRouteNode";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router, RouterError } from "@real-router/core";

// Reactive-lifecycle regression invariants (#778) — the gap the audit flagged:
// INVARIANTS/property suites cover only pure functions, none asserts that the
// subscription lifecycle survives deactivate/reactivate. This is the vue P4
// probe ported as a permanent guard.
describe("reactive lifecycle (#778)", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  // Vue is the ONLY adapter immune to the reconnect-staleness window (#765): a
  // deactivated subtree under native <KeepAlive> keeps its effect scope alive,
  // so the useRefFromSource bridge subscription stays connected and a
  // navigation that lands while the consumer is deactivated is reflected on
  // reactivation — no dependence on any sources reconcile. Anti-stale
  // counterpart of the react <Activity> hide→navigate→show stale window.
  it("P4: a useRouteNode consumer deactivated under <KeepAlive> reactivates fresh", async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
    await router.navigate("users.list");
    await flushPromises();

    const NodeReader = defineComponent({
      name: "NodeReader",
      setup() {
        const { route } = useRouteNode("users");

        return () =>
          h("div", { "data-testid": "node" }, route.value?.name ?? "none");
      },
    });
    const Other = defineComponent({
      name: "Other",
      setup: () => () => h("div", { "data-testid": "other" }, "other"),
    });

    const show = ref(true);
    const App = defineComponent({
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                h(KeepAlive, null, {
                  default: () => (show.value ? h(NodeReader) : h(Other)),
                }),
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    // Active on users.list → the "users" node is active.
    expect(wrapper.find("[data-testid='node']").text()).toBe("users.list");

    // Deactivate NodeReader — <KeepAlive> caches it; the effect scope (and the
    // bridge subscription) stays alive, unlike a real unmount.
    show.value = false;
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='other']").exists()).toBe(true);

    // Navigate OUT of the "users" node while the consumer is deactivated.
    await router.navigate("about");
    await nextTick();
    await flushPromises();

    // Reactivate — the kept-alive subscription tracked the navigation, so the
    // node route is FRESH (now inactive → undefined), not the stale users.list.
    show.value = true;
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='node']").text()).toBe("none");

    wrapper.unmount();
  });

  // #765 1.2 manifestation: a navigation error that fires BEFORE a
  // RouterErrorBoundary mounts (the ordinary load order — a lazy app shell, or a
  // failed boot navigation) is invisible to a boundary that creates its error
  // source lazily on mount, AFTER the error. RouterProvider now eagerly creates
  // the per-router error source, so it captures the error from Provider mount;
  // the boundary's createDismissableError catches up (#765) and shows the
  // fallback.
  it("P2: a RouterErrorBoundary mounted AFTER a navigation error shows the fallback", async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();

    const showBoundary = ref(false);
    const App = defineComponent({
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                showBoundary.value
                  ? h(
                      RouterErrorBoundary,
                      {
                        fallback: (error: RouterError) =>
                          h("div", { "data-testid": "fb" }, error.code),
                      },
                      { default: () => h("div", "app") },
                    )
                  : h("div", "app"),
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    // Navigation error BEFORE the boundary mounts.
    await router.navigate("nonexistent").catch(() => {});
    await nextTick();
    await flushPromises();

    // Mount the boundary now (e.g. a lazily-loaded app shell).
    showBoundary.value = true;
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='fb']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fb']").text()).toBe("ROUTE_NOT_FOUND");

    wrapper.unmount();
  });
});
