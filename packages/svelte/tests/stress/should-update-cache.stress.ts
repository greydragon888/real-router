import { tick } from "svelte";
import { describe, it, expect, afterEach } from "vitest";

import ManyConsumers from "./components/ManyConsumers.svelte";
import SameNodeConsumers from "./components/SameNodeConsumers.svelte";
import StressConsumer from "./components/StressConsumer.svelte";
import { createStressRouter, renderWithRouter, forceGC } from "./helpers";

describe("SV6 — shouldUpdateCache growth (Svelte)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("6.1: 200 unique useRouteNode(name) — all fire effects, no crash on navigation", async () => {
    const router = createStressRouter(200);

    await router.start("/route0");

    const renderCounts: number[] = Array.from<number>({ length: 200 }).fill(0);
    const onRenders = renderCounts.map((_, i) => () => {
      renderCounts[i]++;
    });

    const { unmount } = renderWithRouter(router, ManyConsumers, {
      count: 200,
      prefix: "route",
      onRenders,
    });

    await tick();

    for (let i = 0; i < 200; i++) {
      expect(renderCounts[i]).toBeGreaterThan(0);
    }

    await router.navigate("route1");
    await tick();

    await router.navigate("route100");
    await tick();

    expect(router.getState()?.name).toBe("route100");

    unmount();
    router.stop();
  });

  it("6.2: same nodeName × 100 components — cache hit, consistent state", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const { container, unmount } = renderWithRouter(router, SameNodeConsumers, {
      count: 100,
      nodeName: "users",
    });

    await tick();

    await router.navigate("users.list");
    await tick();

    const divsAfterUsers = container.querySelectorAll("div");

    expect(divsAfterUsers).toHaveLength(100);

    for (const div of divsAfterUsers) {
      expect(div.textContent).toBe("users.list");
    }

    await router.navigate("route1");
    await tick();

    const textsAfterRoute = new Set(
      [...container.querySelectorAll("div")].map((d) => d.textContent),
    );

    expect(textsAfterRoute.size).toBe(1);

    unmount();
    router.stop();
  });

  it("6.3: router stop + GC → new router works independently", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    const { unmount } = renderWithRouter(router, ManyConsumers, {
      count: 50,
      prefix: "route",
    });

    await tick();

    unmount();
    router.stop();
    forceGC();

    const router2 = createStressRouter(50);

    await router2.start("/route0");

    let effectCount = 0;

    const { unmount: unmount2 } = renderWithRouter(router2, StressConsumer, {
      nodeName: "route0",
      onRender: () => {
        effectCount++;
      },
    });

    await tick();

    expect(effectCount).toBeGreaterThan(0);

    await router2.navigate("route1");
    await tick();

    expect(effectCount).toBeGreaterThan(1);

    unmount2();
    router2.stop();
  });

  it("6.4: 2 routers × 50 nodeNames — isolated caches, no cross-talk", async () => {
    const router1 = createStressRouter(50);
    const router2 = createStressRouter(50);

    await router1.start("/route0");
    await router2.start("/route0");

    let r1Renders = 0;
    let r2Renders = 0;

    const incrementR1 = () => {
      r1Renders++;
    };
    const incrementR2 = () => {
      r2Renders++;
    };
    const onRenders1 = Array.from({ length: 50 }, () => incrementR1);
    const onRenders2 = Array.from({ length: 50 }, () => incrementR2);

    const comp1 = renderWithRouter(router1, ManyConsumers, {
      count: 50,
      prefix: "route",
      onRenders: onRenders1,
    });
    const comp2 = renderWithRouter(router2, ManyConsumers, {
      count: 50,
      prefix: "route",
      onRenders: onRenders2,
    });

    await tick();

    const r1After = r1Renders;
    const r2After = r2Renders;

    await router1.navigate("route1");
    await tick();

    expect(r1Renders - r1After).toBeGreaterThan(0);
    expect(r2Renders - r2After).toBe(0);

    const r1Before2 = r1Renders;
    const r2Before2 = r2Renders;

    await router2.navigate("route1");
    await tick();

    expect(r2Renders - r2Before2).toBeGreaterThan(0);
    expect(r1Renders - r1Before2).toBe(0);

    comp1.unmount();
    comp2.unmount();
    router1.stop();
    router2.stop();
  });
});
