import { createRouter } from "@real-router/core";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { RouteView } from "../../src/components/RouteView";
import { useRouteEnter } from "../../src/composables/useRouteEnter";
import { useRouteExit } from "../../src/composables/useRouteExit";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";

// #1221 — under Vue's native <KeepAlive>, a component is DEACTIVATED (not
// unmounted) when navigated away from, and its effect scope stays alive. Neither
// useRouteEnter (a watch(route)) nor useRouteExit (a subscribeLeave) gated on
// activated/deactivated state, so a sleeping page's handlers kept running on
// unrelated app navigations — and a sleeping page's async exit handler was
// spliced into every navigation's leave cycle, blocking the whole app.
//
// Decision A (strict mount): a deactivated page fires neither enter nor exit;
// reactivation does NOT re-fire enter (a kept-alive page is never unmounted, so
// waking it is not a mount — matches the "fires once when the component mounts"
// contract). Native onActivated covers the "re-run on show" niche.
describe("useRouteEnter / useRouteExit under <KeepAlive> (#1221)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(
      [
        { name: "pageA", path: "/a" },
        { name: "pageB", path: "/b" },
        { name: "other", path: "/other" },
      ],
      { defaultRoute: "other" },
    );
    // Start away from pageA so its later navigation is a real mount.
    await router.start("/other");
  });

  afterEach(() => {
    router.stop();
  });

  function mountKeepAlive(pageASetup: () => void) {
    const PageA = defineComponent({
      name: "PageA",
      setup() {
        pageASetup();

        return () => h("div", { "data-testid": "pageA" });
      },
    });

    const passive = (testid: string) =>
      defineComponent({
        setup: () => () => h("div", { "data-testid": testid }),
      });

    return mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                h(
                  RouteView,
                  { nodeName: "", keepAlive: true },
                  {
                    default: () => [
                      h(
                        RouteView.Match,
                        { segment: "pageA" },
                        { default: () => h(PageA) },
                      ),
                      h(
                        RouteView.Match,
                        { segment: "pageB" },
                        { default: () => h(passive("pageB")) },
                      ),
                      h(
                        RouteView.Match,
                        { segment: "other" },
                        { default: () => h(passive("other")) },
                      ),
                    ],
                  },
                ),
            },
          ),
      }),
    );
  }

  it("a deactivated (kept-alive) page does NOT fire useRouteEnter on foreign navigations (#1221)", async () => {
    let enterCount = 0;

    const wrapper = mountKeepAlive(() => {
      useRouteEnter(() => {
        enterCount++;
      });
    });

    await router.navigate("pageA");
    await router.navigate("pageB"); // leaves pageA → PageA deactivates (kept alive)
    await flushPromises();

    // Count once PageA is asleep. (The deactivating navigation is PageA's last
    // active one — it fires while the page is still active, exactly as a
    // non-kept-alive page fires on the leave-nav before it unmounts. This bug is
    // about firings AFTER the page is asleep.)
    const whileAsleep = enterCount;

    await router.navigate("other"); // foreign nav — PageA is sleeping
    await router.navigate("pageB"); // another foreign nav
    await flushPromises();

    // A sleeping page fires nothing on unrelated navigations.
    expect(enterCount).toBe(whileAsleep);

    wrapper.unmount();
  });

  it("reactivating a kept-alive page does NOT re-fire useRouteEnter (strict-mount, decision A) (#1221)", async () => {
    let enterCount = 0;

    const wrapper = mountKeepAlive(() => {
      useRouteEnter(() => {
        enterCount++;
      });
    });

    await router.navigate("pageA");
    await router.navigate("pageB"); // deactivate
    await flushPromises();
    const beforeReactivate = enterCount;

    await router.navigate("pageA"); // reactivate (nav back)
    await flushPromises();

    // Waking a kept-alive page is not a mount → enter does not re-fire.
    expect(enterCount).toBe(beforeReactivate);

    wrapper.unmount();
  });

  it("a deactivated page's async useRouteExit handler does NOT run on foreign navigations (#1221)", async () => {
    let exitCount = 0;

    const wrapper = mountKeepAlive(() => {
      useRouteExit(async () => {
        exitCount++;
        await Promise.resolve();
      });
    });

    await router.navigate("pageA");
    await flushPromises();

    await router.navigate("pageB"); // PageA is left → exit fires (correct)
    await flushPromises();

    expect(exitCount).toBe(1);

    // Foreign navigations while PageA sleeps must NOT run its exit handler —
    // otherwise a sleeping page's slow autosave blocks every navigation.
    await router.navigate("other");
    await router.navigate("pageB");
    await flushPromises();

    expect(exitCount).toBe(1);

    wrapper.unmount();
  });

  it("a non-kept-alive component still fires enter + exit normally (gate is inert without KeepAlive)", async () => {
    let enterCount = 0;
    let exitCount = 0;

    const Probe = defineComponent({
      setup() {
        useRouteEnter(() => {
          enterCount++;
        });
        useRouteExit(() => {
          exitCount++;
        });

        return () => h("div");
      },
    });

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(Probe) }),
      }),
    );

    await router.navigate("pageA");
    await router.navigate("pageB");
    await flushPromises();

    expect(enterCount).toBeGreaterThan(0);
    expect(exitCount).toBeGreaterThan(0);

    wrapper.unmount();
  });
});
