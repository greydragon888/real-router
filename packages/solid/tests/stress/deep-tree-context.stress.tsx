import { createRouter } from "@real-router/core";
import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect } from "vitest";

import {
  RouterProvider,
  useRouteNode,
  useRoute,
  useRouter,
} from "@real-router/solid";

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
    chain.push(`${chain.at(-1)}.${seg}`);
  }

  return chain;
}

describe("S5 — deep component tree + context cascade (Solid)", () => {
  it("5.1: 30 deep useRouteNode — only relevant nodes update on navigation", async () => {
    const router = createDeepRouter(30, 1);

    await router.start("/other");

    const chain = buildNodeChain(30);
    const midRoute = chain[15];
    const effectCounts: number[] = Array.from<number>({
      length: chain.length,
    }).fill(0);

    function NodeSubscriber(props: { index: number }) {
      const routeState = useRouteNode(chain[props.index]);

      createEffect(() => {
        routeState();
        effectCounts[props.index]++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        {chain.map((_, i) => (
          <NodeSubscriber index={i} />
        ))}
      </RouterProvider>
    ));

    const afterMount = [...effectCounts];

    await router.navigate(midRoute);

    for (let i = 0; i <= 15; i++) {
      expect(effectCounts[i] - afterMount[i]).toBeGreaterThan(0);
    }
    for (let i = 16; i < chain.length; i++) {
      expect(effectCounts[i] - afterMount[i]).toBe(0);
    }

    router.stop();
  });

  it("5.2: 30 deep useRouter (stable) — 0 effect re-runs from navigation", async () => {
    const router = createDeepRouter(30, 1);
    const chain = buildNodeChain(30);

    await router.start("/other");

    let totalEffects = 0;

    function RouterUser() {
      useRouter();

      createEffect(() => {
        totalEffects++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 30 }, () => (
          <RouterUser />
        ))}
      </RouterProvider>
    ));

    const afterMount = totalEffects;

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(nav % 2 === 0 ? chain.at(-1) : "other");
    }

    expect(totalEffects - afterMount).toBe(0);

    router.stop();
  });

  it("5.3: wide tree + useRoute on leaves — all 25 leaves update every navigation", async () => {
    const router = createDeepRouter(2, 5);

    await router.start("/other");

    let leafEffects = 0;

    function LeafConsumer() {
      const routeState = useRoute();

      createEffect(() => {
        routeState();
        leafEffects++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 25 }, () => (
          <LeafConsumer />
        ))}
      </RouterProvider>
    ));

    const afterMount = leafEffects;

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(nav % 2 === 0 ? "root.n0" : "other");
    }

    expect(leafEffects - afterMount).toBeGreaterThanOrEqual(25 * 50);

    router.stop();
  });

  it("5.4: nested RouterProviders — router1 navigation doesn't affect router2 signals", async () => {
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

    let r2RouteName: string | undefined;
    let r2EffectRuns = 0;

    function R2Consumer() {
      const routeState = useRouteNode("");

      createEffect(() => {
        const state = routeState();

        r2RouteName = state.route?.name;
        r2EffectRuns++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router1}>
        <RouterProvider router={router2}>
          <R2Consumer />
        </RouterProvider>
      </RouterProvider>
    ));

    const r2After = r2EffectRuns;

    for (let i = 0; i < 50; i++) {
      await router1.navigate(i % 2 === 0 ? "r1b" : "r1a");
    }

    expect(r2RouteName).toBe("r2a");
    expect(r2EffectRuns - r2After).toBe(0);

    router1.stop();
    router2.stop();
  });
});
