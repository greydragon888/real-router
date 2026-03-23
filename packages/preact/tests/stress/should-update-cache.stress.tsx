import { render, act, cleanup } from "@testing-library/preact";
import { describe, it, expect, afterEach } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/preact";

import { createStressRouter, forceGC } from "./helpers";

import type { FunctionComponent } from "preact";

describe("shouldUpdateCache growth (Preact)", () => {
  afterEach(() => {
    cleanup();
  });

  it("6.1: 200 unique useRouteNode(name) — all render, no crash on navigation", async () => {
    const router = createStressRouter(200);

    await router.start("/route0");

    const renderCounts: number[] = Array.from<number>({ length: 200 }).fill(0);

    const Components: FunctionComponent = () => (
      <>
        {Array.from({ length: 200 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            useRouteNode(`route${i}`);
            renderCounts[i]++;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    render(
      <RouterProvider router={router}>
        <Components />
      </RouterProvider>,
    );

    for (let i = 0; i < 200; i++) {
      expect(renderCounts[i]).toBeGreaterThan(0);
    }

    await act(async () => {
      await router.navigate("route1");
    });
    await act(async () => {
      await router.navigate("route100");
    });

    expect(router.getState()?.name).toBe("route100");

    router.stop();
  });

  it("6.2: same nodeName × 100 components — cache hit, consistent state", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routeCaptures: (string | undefined)[] = Array.from<
      string | undefined
    >({
      length: 100,
    }).fill(undefined);

    const Components: FunctionComponent = () => (
      <>
        {Array.from({ length: 100 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            const { route } = useRouteNode("users");

            routeCaptures[i] = route?.name;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    render(
      <RouterProvider router={router}>
        <Components />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("users.list");
    });

    for (let i = 0; i < 100; i++) {
      expect(routeCaptures[i]).toBe("users.list");
    }

    await act(async () => {
      await router.navigate("route1");
    });

    const uniqueValues = new Set(routeCaptures);

    expect(uniqueValues.size).toBe(1);

    router.stop();
  });

  it("6.3: router stop + GC → new router works independently", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    const Components: FunctionComponent = () => (
      <>
        {Array.from({ length: 50 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            useRouteNode(`route${i}`);

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    const { unmount } = render(
      <RouterProvider router={router}>
        <Components />
      </RouterProvider>,
    );

    unmount();
    router.stop();
    forceGC();

    const router2 = createStressRouter(50);

    await router2.start("/route0");

    let renderCount = 0;
    const NewConsumer: FunctionComponent = () => {
      useRouteNode("route0");
      renderCount++;

      return null;
    };

    render(
      <RouterProvider router={router2}>
        <NewConsumer />
      </RouterProvider>,
    );

    expect(renderCount).toBeGreaterThan(0);

    await act(async () => {
      await router2.navigate("route1");
    });

    expect(renderCount).toBeGreaterThan(1);

    router2.stop();
  });

  it("6.4: 2 routers × 50 nodeNames — isolated caches, no cross-talk", async () => {
    const router1 = createStressRouter(50);
    const router2 = createStressRouter(50);

    await router1.start("/route0");
    await router2.start("/route0");

    let r1Renders = 0;
    let r2Renders = 0;

    const R1Consumers: FunctionComponent = () => (
      <>
        {Array.from({ length: 50 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            useRouteNode(`route${i}`);
            r1Renders++;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    const R2Consumers: FunctionComponent = () => (
      <>
        {Array.from({ length: 50 }, (_, i) => {
          const Sub: FunctionComponent = () => {
            useRouteNode(`route${i}`);
            r2Renders++;

            return null;
          };

          return <Sub key={i} />;
        })}
      </>
    );

    render(
      <>
        <RouterProvider router={router1}>
          <R1Consumers />
        </RouterProvider>
        <RouterProvider router={router2}>
          <R2Consumers />
        </RouterProvider>
      </>,
    );

    const r1After = r1Renders;
    const r2After = r2Renders;

    await act(async () => {
      await router1.navigate("route1");
    });

    expect(r1Renders - r1After).toBeGreaterThan(0);
    expect(r2Renders - r2After).toBe(0);

    const r1Before2 = r1Renders;
    const r2Before2 = r2Renders;

    await act(async () => {
      await router2.navigate("route1");
    });

    expect(r2Renders - r2Before2).toBeGreaterThan(0);
    expect(r1Renders - r1Before2).toBe(0);

    router1.stop();
    router2.stop();
  });
});
