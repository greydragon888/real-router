import { createRouter } from "@real-router/core";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, it, expect, afterEach } from "vitest";

import NestedProviderApp from "./components/NestedProviderApp.svelte";
import RouterUserConsumer from "./components/RouterUserConsumer.svelte";
import StressConsumer from "./components/StressConsumer.svelte";
import { renderWithRouter } from "./helpers";

import type { Route, Router } from "@real-router/core";

function createDeepRouter(depth: number, breadth: number): Router {
  function buildChildren(prefix: string, level: number): Route[] {
    if (level >= depth) {
      return [];
    }

    return Array.from({ length: breadth }, (_, i) => {
      const name = `${prefix}${i}`;

      return {
        name,
        path: `/${name}`,
        children: buildChildren(name, level + 1),
      };
    });
  }

  const routes: Route[] = [
    { name: "root", path: "/root", children: buildChildren("n", 0) },
    { name: "other", path: "/other" },
  ];

  return createRouter(routes, { defaultRoute: "other" });
}

function buildNodeChain(depth: number): string[] {
  const chain: string[] = ["root"];
  let seg = "n";

  for (let d = 0; d < depth; d++) {
    seg += "0";
    const lastNode = chain.at(-1);

    if (lastNode) {
      chain.push(`${lastNode}.${seg}`);
    }
  }

  return chain;
}

describe("SV5 — deep component tree + context cascade (Svelte)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("5.1: 30 deep useRouteNode — only relevant nodes update on navigation", async () => {
    const router = createDeepRouter(30, 1);

    await router.start("/other");

    const chain = buildNodeChain(30);
    const midRoute = chain[15];
    const renderCounts: number[] = Array.from<number>({
      length: chain.length,
    }).fill(0);

    const components = chain.map((nodeName, i) =>
      renderWithRouter(router, StressConsumer, {
        nodeName,
        onRender: () => {
          renderCounts[i]++;
        },
      }),
    );

    await tick();

    const afterMount = [...renderCounts];

    await router.navigate(midRoute);
    await tick();

    for (let i = 0; i <= 15; i++) {
      expect(renderCounts[i] - afterMount[i]).toBeGreaterThan(0);
    }
    for (let i = 16; i < chain.length; i++) {
      expect(renderCounts[i] - afterMount[i]).toBe(0);
    }

    for (const comp of components) {
      comp.unmount();
    }

    router.stop();
  });

  it("5.2: 30 deep useRouter (stable) — 0 effect re-runs from navigation", async () => {
    const router = createDeepRouter(30, 1);
    const chain = buildNodeChain(30);

    await router.start("/other");

    const effectRuns: number[] = Array.from<number>({ length: 30 }).fill(0);
    const components = Array.from({ length: 30 }, (_, i) =>
      renderWithRouter(router, RouterUserConsumer, {
        onRender: () => {
          effectRuns[i]++;
        },
      }),
    );

    await tick();

    const totalAfterMount = effectRuns.reduce((a, b) => a + b, 0);

    for (let nav = 0; nav < 50; nav++) {
      const lastRoute = chain.at(-1);

      await router.navigate(nav % 2 === 0 && lastRoute ? lastRoute : "other");
      await tick();
    }

    const totalAfterNav = effectRuns.reduce((a, b) => a + b, 0);

    expect(totalAfterNav - totalAfterMount).toBe(0);

    for (const comp of components) {
      comp.unmount();
    }

    router.stop();
  });

  it("5.4: nested RouterProviders — router1 navigation doesn't affect router2 state", async () => {
    const router1 = createRouter(
      [
        { name: "r1a", path: "/a" },
        { name: "r1b", path: "/b" },
      ],
      { defaultRoute: "r1a" },
    );
    const router2 = createRouter(
      [
        { name: "r2a", path: "/a" },
        { name: "r2b", path: "/b" },
      ],
      { defaultRoute: "r2a" },
    );

    await router1.start("/a");
    await router2.start("/a");

    let r2EffectRuns = 0;

    const { container, unmount } = render(NestedProviderApp, {
      props: {
        router1,
        router2,
        onR2Render: () => {
          r2EffectRuns++;
        },
      },
    });

    await tick();

    const r2After = r2EffectRuns;

    for (let i = 0; i < 50; i++) {
      await router1.navigate(i % 2 === 0 ? "r1b" : "r1a");
      await tick();
    }

    const div = container.querySelector("div");

    expect(div?.textContent).toBe("r2a");
    expect(r2EffectRuns - r2After).toBe(0);

    unmount();
    router1.stop();
    router2.stop();
  });
});
