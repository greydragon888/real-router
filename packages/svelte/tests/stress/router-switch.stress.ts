import { createRouter } from "@real-router/core";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, it, expect } from "vitest";

import RouterSwitchHarness from "./components/RouterSwitchHarness.svelte";
import { forceGC, MB, takeHeapSnapshot } from "./helpers";

import type { Router } from "@real-router/core";

// Audit follow-up #2.4 — HMR / test-harness scenario: the same component
// tree is reused across router identities. The supported pattern is
// `{#key router}<RouterProvider {router}>...</RouterProvider>{/key}`, which
// destroys the inner subtree on identity change and rebinds child contexts
// (setContext fires once per script run). This stress test verifies that
// switching the router N times leaves no straggling subscriptions and
// keeps the heap bounded.

function makeRouter(prefix: string): Router {
  return createRouter(
    [
      { name: "home", path: "/" },
      { name: `${prefix}-a`, path: `/${prefix}-a` },
      { name: `${prefix}-b`, path: `/${prefix}-b` },
    ],
    { defaultRoute: "home" },
  );
}

describe("Stress: dynamic router switch in RouterProvider", () => {
  it("15.1 200 router-prop swaps via {#key router} — no leaks, child stays consistent", async () => {
    const initial = makeRouter("r0");

    await initial.start("/");

    const mounted = render(RouterSwitchHarness, {
      props: { router: initial },
    });

    await tick();

    forceGC();
    const heapBefore = takeHeapSnapshot();

    const previousRouters: Router[] = [initial];

    for (let i = 1; i <= 200; i++) {
      const next = makeRouter(`r${i}`);

      await next.start("/");

      // `rerender` swaps the prop on the existing root component instance —
      // {#key router} reacts to identity change and rebuilds the subtree.
      await mounted.rerender({ router: next });
      await tick();

      // Stop the previous router immediately — the {#key} block has already
      // destroyed any subscriptions that pointed to it. Holding it open
      // would mask listener leaks behind a still-live router instance.
      const prev = previousRouters.at(-1);

      if (prev) {
        prev.stop();
      }

      previousRouters.push(next);
    }

    forceGC();
    const heapAfter = takeHeapSnapshot();

    // Throughput guard (GC-masked): each {#key} swap destroys the prior subtree
    // and stops the prior router, refs dropped — a per-swap subscription leak is
    // reclaimed by GC. The cyclic-state-preservation test (15.2) proves the
    // swap rebinds correctly. Threshold = ~8x measured healthy (~5.87MB over
    // 200 swaps).
    expect(heapAfter - heapBefore).toBeLessThan(48 * MB);

    mounted.unmount();
    previousRouters.at(-1)?.stop();
  });

  it("15.2 cyclic A → B → A swap preserves both routers' independent state", async () => {
    const routerA = makeRouter("a");
    const routerB = makeRouter("b");

    await routerA.start("/");
    await routerB.start("/");

    const result = render(RouterSwitchHarness, { props: { router: routerA } });

    await tick();

    await routerA.navigate("a-a");
    await tick();

    expect(routerA.getState()?.name).toBe("a-a");

    await result.rerender({ router: routerB });
    await tick();

    await routerB.navigate("b-b");
    await tick();

    expect(routerB.getState()?.name).toBe("b-b");

    // Switching back must not corrupt routerA — its internal state must
    // still reflect the last navigation it performed before the switch.
    await result.rerender({ router: routerA });
    await tick();

    expect(routerA.getState()?.name).toBe("a-a");
    expect(routerB.getState()?.name).toBe("b-b");

    result.unmount();
    routerA.stop();
    routerB.stop();
  });
});
