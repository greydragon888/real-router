import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import {
  createStressRouter,
  mountWithProvider,
  navigateSequentially,
} from "./helpers";
import { Link } from "../../src/components/Link";

import type { Router } from "@real-router/core";

describe("link-mass-rendering stress tests (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(200);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("2.1: 200 Links mount — correct DOM, no render loops", async () => {
    const wrapper = mountWithProvider(router, () =>
      Array.from({ length: 200 }, (_, i) =>
        h(
          Link,
          { key: i, routeName: `route${i}`, "data-testid": `link-${i}` },
          { default: () => `Link ${i}` },
        ),
      ),
    );

    await nextTick();
    await flushPromises();

    const links = wrapper.findAll("a");

    expect(links).toHaveLength(200);
  });

  it("2.2: 200 Links to different routes + navigate to one — only that Link gets active class", async () => {
    const wrapper = mountWithProvider(router, () =>
      Array.from({ length: 200 }, (_, i) =>
        h(
          Link,
          {
            key: i,
            routeName: `route${i}`,
            activeClassName: "active",
            "data-testid": `link-${i}`,
          },
          { default: () => `Link ${i}` },
        ),
      ),
    );

    await nextTick();
    await flushPromises();

    await router.navigate("route5");
    await nextTick();
    await flushPromises();

    const activeLinks = wrapper.findAll(".active");

    expect(activeLinks).toHaveLength(1);
    expect(wrapper.find("[data-testid='link-5']").classes()).toContain(
      "active",
    );
    expect(wrapper.find("[data-testid='link-0']").classes()).not.toContain(
      "active",
    );
  });

  it("2.3: 200 Links + 50 navigations round-robin — correct active state at end", async () => {
    const wrapper = mountWithProvider(router, () =>
      Array.from({ length: 200 }, (_, i) =>
        h(
          Link,
          {
            key: i,
            routeName: `route${i}`,
            activeClassName: "active",
            "data-testid": `link-${i}`,
          },
          { default: () => `Link ${i}` },
        ),
      ),
    );

    await nextTick();
    await flushPromises();

    await router.navigate("users.list");
    await nextTick();
    await flushPromises();

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    await navigateSequentially(
      router,
      routeNames.map((name) => ({ name })),
    );

    expect(wrapper.find("[data-testid='link-49']").classes()).toContain(
      "active",
    );
    expect(wrapper.findAll(".active")).toHaveLength(1);
  });

  it("2.4: 200 Links with deep routeParams + navigation — correct active state", async () => {
    const deepParams = (i: number): Record<string, string> => {
      const id = String(i);

      return {
        id,
        a: "1",
        b: "2",
        c: "3",
        d: "4",
        e: "5",
      };
    };

    const wrapper = mountWithProvider(router, () =>
      Array.from({ length: 200 }, (_, i) =>
        h(
          Link,
          {
            key: i,
            routeName: `route${i}`,
            routeParams: deepParams(i),
            activeClassName: "active",
            "data-testid": `link-${i}`,
          },
          { default: () => `Link ${i}` },
        ),
      ),
    );

    await nextTick();
    await flushPromises();

    await router.navigate("route10");
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='link-10']").classes()).toContain(
      "active",
    );
    expect(wrapper.findAll(".active")).toHaveLength(1);

    await router.navigate("route50");
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='link-50']").classes()).toContain(
      "active",
    );
    expect(wrapper.find("[data-testid='link-10']").classes()).not.toContain(
      "active",
    );
    expect(wrapper.findAll(".active")).toHaveLength(1);
  });

  it("2.5: 50 rapid Link clicks without await — 0 unhandled rejections, final route is correct", async () => {
    const wrapper = mountWithProvider(router, () =>
      h(
        Link,
        {
          routeName: "route5",
          activeClassName: "active",
          "data-testid": "link",
        },
        { default: () => "Link" },
      ),
    );

    await nextTick();
    await flushPromises();

    const link = wrapper.find("[data-testid='link']");

    for (let i = 0; i < 50; i++) {
      await link.trigger("click");
    }

    await nextTick();
    await flushPromises();

    expect(link.classes()).toContain("active");
  });

  it("2.6: 100 Links with dynamic routeName — active class tracks prop changes", async () => {
    const currentTarget = ref("route0");

    const App = defineComponent({
      name: "DynamicLinks",
      setup() {
        return () =>
          Array.from({ length: 100 }, (_, i) =>
            h(
              Link,
              {
                key: i,
                routeName: i === 0 ? currentTarget.value : `route${i}`,
                activeClassName: "active",
                "data-testid": `link-${i}`,
              },
              { default: () => `Link ${i}` },
            ),
          );
      },
    });

    const wrapper = mountWithProvider(router, () => h(App));

    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='link-0']").classes()).toContain(
      "active",
    );

    for (let i = 1; i <= 50; i++) {
      const routeName = `route${i}`;

      currentTarget.value = routeName;

      await router.navigate(routeName);
      await nextTick();
      await flushPromises();

      expect(wrapper.find("[data-testid='link-0']").classes()).toContain(
        "active",
      );
    }

    currentTarget.value = "route99";
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='link-0']").classes()).not.toContain(
      "active",
    );

    await router.navigate("route99");
    await nextTick();
    await flushPromises();

    expect(wrapper.find("[data-testid='link-0']").classes()).toContain(
      "active",
    );
  });
});

// Closes the §7.2 #13 review item: "Concurrent <Link> clicks с {force: true}
// — link-mass-rendering.stress.ts:170-196 covers 50 rapid clicks WITHOUT
// force. force:true is not exercised." Patched here to lock the SAME_STATES
// bypass: every click on a same-route Link with `routeOptions: {force: true}`
// must invoke router.navigate so the FSM observes 50 successful transitions.
//
// Counterpart: `packages/preact/tests/stress/link-hash-stress.stress.tsx`
// — Preact uses navigateWithHash to exercise auto-force; Vue's Link
// surfaces force via `routeOptions`.
describe("§7.2 #13 — Mass concurrent clicks with force=true (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route5");
  });

  afterEach(() => {
    router.stop();
  });

  it("13.1: 50 rapid same-route clicks with force=true — every click invokes router.navigate", async () => {
    // Spy on router.navigate so we can count the actual calls. Core's
    // SAME_STATES guard would normally short-circuit duplicate same-route
    // navigations, but `force: true` bypasses it.
    const calls: { name: string; options: unknown }[] = [];
    const original = router.navigate.bind(router);

    router.navigate = ((name, params, search, options) => {
      calls.push({ name, options: options ?? {} });

      return original(name, params, search, options);
    }) as typeof router.navigate;

    const wrapper = mountWithProvider(router, () =>
      h(
        Link,
        {
          routeName: "route5",
          routeOptions: { force: true },
          activeClassName: "active",
          "data-testid": "force-link",
        },
        { default: () => "Force Link" },
      ),
    );

    await nextTick();
    await flushPromises();

    const link = wrapper.find("[data-testid='force-link']");

    for (let i = 0; i < 50; i++) {
      await link.trigger("click");
    }

    await nextTick();
    await flushPromises();

    // Each click must produce one navigate call — the `force` flag
    // bypasses the same-state short-circuit so all 50 commits run.
    expect(calls).toHaveLength(50);

    for (const call of calls) {
      expect(call.name).toBe("route5");
      expect((call.options as { force?: boolean }).force).toBe(true);
    }

    expect(link.classes()).toContain("active");

    wrapper.unmount();
  });

  it("13.2: 30 force-clicks across multiple Links — every click commits, no coalescing", async () => {
    // Different Links pointing at different routes, each with `force: true`.
    // We click each one once in round-robin × 6 cycles = 30 clicks. The
    // expectation is 30 distinct navigate calls, in order.
    const calls: { name: string; options: unknown }[] = [];
    const original = router.navigate.bind(router);

    router.navigate = ((name, params, search, options) => {
      calls.push({ name, options: options ?? {} });

      return original(name, params, search, options);
    }) as typeof router.navigate;

    const wrapper = mountWithProvider(router, () =>
      Array.from({ length: 5 }, (_, i) =>
        h(
          Link,
          {
            key: i,
            routeName: `route${i}`,
            routeOptions: { force: true },
            "data-testid": `force-link-${i}`,
          },
          { default: () => `Link ${i}` },
        ),
      ),
    );

    await nextTick();
    await flushPromises();

    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 5; i++) {
        await wrapper.find(`[data-testid='force-link-${i}']`).trigger("click");
      }
    }

    await nextTick();
    await flushPromises();

    expect(calls).toHaveLength(30);

    for (const call of calls) {
      expect((call.options as { force?: boolean }).force).toBe(true);
    }

    wrapper.unmount();
  });
});
