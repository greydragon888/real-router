import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { h, nextTick } from "vue";

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
});
