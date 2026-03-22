import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/solid";

import { createStressRouter, forceGC } from "./helpers";

describe("S6 — shouldUpdateCache growth (Solid)", () => {
  it("6.1: 200 unique useRouteNode(name) — all fire effects, no crash on navigation", async () => {
    const router = createStressRouter(200);

    await router.start("/route0");

    const effectCounts: number[] = Array.from<number>({ length: 200 }).fill(0);

    function Sub(props: { index: number }) {
      const routeState = useRouteNode(`route${props.index}`);

      createEffect(() => {
        routeState();
        effectCounts[props.index]++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 200 }, (_, i) => (
          <Sub index={i} />
        ))}
      </RouterProvider>
    ));

    for (let i = 0; i < 200; i++) {
      expect(effectCounts[i]).toBeGreaterThan(0);
    }

    await router.navigate("route1");
    await router.navigate("route100");

    expect(router.getState()?.name).toBe("route100");

    router.stop();
  });

  it("6.2: same nodeName × 100 components — cache hit, consistent signal state", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routeCaptures: (string | undefined)[] = Array.from<
      string | undefined
    >({ length: 100 }).fill(undefined);

    function Sub(props: { index: number }) {
      const routeState = useRouteNode("users");

      createEffect(() => {
        routeCaptures[props.index] = routeState().route?.name;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 100 }, (_, i) => (
          <Sub index={i} />
        ))}
      </RouterProvider>
    ));

    await router.navigate("users.list");

    for (let i = 0; i < 100; i++) {
      expect(routeCaptures[i]).toBe("users.list");
    }

    await router.navigate("route1");

    const uniqueValues = new Set(routeCaptures);

    expect(uniqueValues.size).toBe(1);

    router.stop();
  });

  it("6.3: router stop + GC → new router works independently", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    function Sub(props: { index: number }) {
      useRouteNode(`route${props.index}`);

      return null;
    }

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 50 }, (_, i) => (
          <Sub index={i} />
        ))}
      </RouterProvider>
    ));

    unmount();
    router.stop();
    forceGC();

    const router2 = createStressRouter(50);

    await router2.start("/route0");

    let effectCount = 0;

    function NewConsumer() {
      const routeState = useRouteNode("route0");

      createEffect(() => {
        routeState();
        effectCount++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router2}>
        <NewConsumer />
      </RouterProvider>
    ));

    expect(effectCount).toBeGreaterThan(0);

    await router2.navigate("route1");

    expect(effectCount).toBeGreaterThan(1);

    router2.stop();
  });

  it("6.4: 2 routers × 50 nodeNames — isolated signal caches, no cross-talk", async () => {
    const router1 = createStressRouter(50);
    const router2 = createStressRouter(50);

    await router1.start("/route0");
    await router2.start("/route0");

    let r1Effects = 0;
    let r2Effects = 0;

    function R1Sub(props: { index: number }) {
      const routeState = useRouteNode(`route${props.index}`);

      createEffect(() => {
        routeState();
        r1Effects++;
      });

      return null;
    }

    function R2Sub(props: { index: number }) {
      const routeState = useRouteNode(`route${props.index}`);

      createEffect(() => {
        routeState();
        r2Effects++;
      });

      return null;
    }

    render(() => (
      <>
        <RouterProvider router={router1}>
          {Array.from({ length: 50 }, (_, i) => (
            <R1Sub index={i} />
          ))}
        </RouterProvider>
        <RouterProvider router={router2}>
          {Array.from({ length: 50 }, (_, i) => (
            <R2Sub index={i} />
          ))}
        </RouterProvider>
      </>
    ));

    const r1After = r1Effects;
    const r2After = r2Effects;

    await router1.navigate("route1");

    expect(r1Effects - r1After).toBeGreaterThan(0);
    expect(r2Effects - r2After).toBe(0);

    const r1Before2 = r1Effects;
    const r2Before2 = r2Effects;

    await router2.navigate("route1");

    expect(r2Effects - r2Before2).toBeGreaterThan(0);
    expect(r1Effects - r1Before2).toBe(0);

    router1.stop();
    router2.stop();
  });
});
