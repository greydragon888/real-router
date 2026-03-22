import { createRouter } from "@real-router/core";
import { tick } from "svelte";
import { describe, it, expect, afterEach } from "vitest";

import ManyConsumers from "./components/ManyConsumers.svelte";
import ManyLinks from "./components/ManyLinks.svelte";
import StressConsumer from "./components/StressConsumer.svelte";

import {
  createStressRouter,
  renderWithRouter,
  navigateSequentially,
  roundRobinRoutes,
} from "./helpers";

describe("combined SPA simulation (Svelte)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("8.1: 30 Links + 10 useRouteNode consumers + 100 navigations", async () => {
    const routes = Array.from({ length: 30 }, (_, i) => ({
      name: `page${i}`,
      path: `/page${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "page0" });

    await router.start("/page0");

    const { container: linkContainer, unmount: unmountLinks } =
      renderWithRouter(router, ManyLinks, {
        count: 30,
        prefix: "page",
      });

    await tick();

    const sidebarRenders: number[] = Array.from({ length: 10 }, () => 0);
    const onRenders = sidebarRenders.map((_, i) => () => {
      sidebarRenders[i]++;
    });

    const { unmount: unmountConsumers } = renderWithRouter(
      router,
      ManyConsumers,
      {
        count: 10,
        prefix: "page",
        onRenders,
      },
    );

    await tick();

    const sidebarAfterMount = [...sidebarRenders];

    for (let nav = 0; nav < 100; nav++) {
      await router.navigate(`page${(nav + 1) % 30}`);
      await tick();
    }

    const links = linkContainer.querySelectorAll("a");

    expect(links).toHaveLength(30);

    for (let i = 0; i < 10; i++) {
      expect(sidebarRenders[i] - sidebarAfterMount[i]).toBeGreaterThanOrEqual(
        2,
      );
    }

    unmountLinks();
    unmountConsumers();
    router.stop();
  });

  it("8.2: 50 Links + 100 navigations — correct final active state", async () => {
    const routes = Array.from({ length: 50 }, (_, i) => ({
      name: `item${i}`,
      path: `/item${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "item0" });

    await router.start("/item0");

    const { container, unmount } = renderWithRouter(router, ManyLinks, {
      count: 50,
      prefix: "item",
    });

    await tick();

    const routeNames = roundRobinRoutes(
      Array.from({ length: 49 }, (_, i) => `item${i + 1}`),
      100,
    );

    await navigateSequentially(
      router,
      routeNames.map((name) => ({ name })),
    );

    const finalRoute = routeNames[routeNames.length - 1];

    expect(router.getState()?.name).toBe(finalRoute);

    const activeLinks = container.querySelectorAll(".active");

    expect(activeLinks.length).toBeGreaterThanOrEqual(1);

    unmount();
    router.stop();
  });

  it("8.3: mount → 50 nav → unmount → remount → 50 nav — correct after remount", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let renderCount = 0;

    const { unmount } = renderWithRouter(router, StressConsumer, {
      nodeName: "",
      onRender: () => {
        renderCount++;
      },
    });

    await tick();

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${(i % 49) + 1}`);
      await tick();
    }

    const countAfterFirst = renderCount;

    expect(countAfterFirst).toBeGreaterThan(0);

    unmount();

    renderCount = 0;

    const { unmount: unmount2 } = renderWithRouter(router, StressConsumer, {
      nodeName: "",
      onRender: () => {
        renderCount++;
      },
    });

    await tick();

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${((i + 1) % 49) + 1}`);
      await tick();
    }

    expect(renderCount).toBeGreaterThan(0);
    expect(router.getState()?.name).toBeDefined();

    unmount2();
    router.stop();
  });
});
