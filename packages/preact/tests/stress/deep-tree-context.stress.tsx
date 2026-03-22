import { createRouter } from "@real-router/core";
import { render, act, cleanup } from "@testing-library/preact";
import { memo } from "preact/compat";
import { describe, it, expect, afterEach } from "vitest";

import {
  RouterProvider,
  useRouteNode,
  useRoute,
  useRouter,
} from "@real-router/preact";

import { createDeepRouter } from "./helpers";

import type { FunctionComponent } from "preact";

describe("deep component tree + context cascade (Preact)", () => {
  afterEach(() => {
    cleanup();
  });

  function buildNodeChain(depth: number): string[] {
    const chain: string[] = ["root"];
    let seg = "n";

    for (let d = 0; d < depth; d++) {
      seg += "0";
      chain.push(`${chain.at(-1)}.${seg}`);
    }

    return chain;
  }

  it("5.1: 30 deep useRouteNode — only relevant nodes re-render", async () => {
    const router = createDeepRouter(30, 1);

    await router.start("/other");

    const chain = buildNodeChain(30);
    const midRoute = chain[15];
    const renderCounts: number[] = Array.from<number>({
      length: chain.length,
    }).fill(0);

    const Components: FunctionComponent = () => (
      <>
        {chain.map((name, i) => {
          const Sub: FunctionComponent = () => {
            useRouteNode(name);
            renderCounts[i]++;

            return null;
          };

          return <Sub key={name} />;
        })}
      </>
    );

    render(
      <RouterProvider router={router}>
        <Components />
      </RouterProvider>,
    );
    const afterMount = [...renderCounts];

    await act(async () => {
      await router.navigate(midRoute);
    });

    for (let i = 0; i <= 15; i++) {
      expect(renderCounts[i] - afterMount[i]).toBeGreaterThan(0);
    }
    for (let i = 16; i < chain.length; i++) {
      expect(renderCounts[i] - afterMount[i]).toBe(0);
    }

    router.stop();
  });

  it("5.2: 30 deep useRouter (stable context) — 0 re-renders from navigation", async () => {
    const router = createDeepRouter(30, 1);
    const chain = buildNodeChain(30);

    await router.start("/other");

    let totalRenders = 0;

    const MemoRouterUser = memo(() => {
      useRouter();
      totalRenders++;

      return null;
    });


    render(
      <RouterProvider router={router}>
        {Array.from({ length: 30 }, (_, i) => (
          <MemoRouterUser key={i} />
        ))}
      </RouterProvider>,
    );
    const afterMount = totalRenders;

    for (let nav = 0; nav < 50; nav++) {
      await act(async () => {
        await router.navigate(nav % 2 === 0 ? chain.at(-1)! : "other");
      });
    }

    expect(totalRenders - afterMount).toBe(0);

    router.stop();
  });

  it("5.3: wide tree + useRoute on leaves — all 25 leaves re-render every navigation", async () => {
    const router = createDeepRouter(2, 5);

    await router.start("/other");

    let leafRenders = 0;
    const LeafConsumer = memo(() => {
      useRoute();
      leafRenders++;

      return null;
    });


    render(
      <RouterProvider router={router}>
        {Array.from({ length: 25 }, (_, i) => (
          <LeafConsumer key={i} />
        ))}
      </RouterProvider>,
    );
    const afterMount = leafRenders;

    for (let nav = 0; nav < 50; nav++) {
      await act(async () => {
        await router.navigate(nav % 2 === 0 ? "root.n0" : "other");
      });
    }

    expect(leafRenders - afterMount).toBeGreaterThanOrEqual(25 * 50);

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

    let r2RouteCapture: string | undefined;
    let r2RenderCount = 0;

    const R2Consumer: FunctionComponent = () => {
      const { route } = useRouteNode("");

      r2RouteCapture = route?.name;
      r2RenderCount++;

      return null;
    };

    render(
      <RouterProvider router={router1}>
        <RouterProvider router={router2}>
          <R2Consumer />
        </RouterProvider>
      </RouterProvider>,
    );

    const r2After = r2RenderCount;

    for (let i = 0; i < 50; i++) {
      await act(async () => {
        await router1.navigate(i % 2 === 0 ? "r1b" : "r1a");
      });
    }

    expect(r2RouteCapture).toBe("r2a");
    expect(r2RenderCount - r2After).toBe(0);

    router1.stop();
    router2.stop();
  });
});
