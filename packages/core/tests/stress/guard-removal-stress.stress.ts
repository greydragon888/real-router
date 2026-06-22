import { describe, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import { createStressRouter } from "./helpers";
import { getInternals } from "../../src/internals";

import type { Router } from "@real-router/core";

describe("S20: Dynamic guard management", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S20.1: Add 50 guards, remove 25 mid-operation — removed guards stop firing, survivors keep firing", async () => {
    const routeCount = 50;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);
    const calls: number[] = Array.from({ length: routeCount }, () => 0);

    const makeGuardFn = (idx: number) => () => {
      calls[idx]++;

      return true;
    };

    for (let i = 1; i < routeCount; i++) {
      lifecycle.addActivateGuard(`route${i}`, () => makeGuardFn(i));
    }

    for (let i = 0; i < 100; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    // route1 will be removed; route40 will survive. Snapshot their counts.
    const removedBefore = calls[1] ?? 0;
    const survivorBefore = calls[40] ?? 0;

    expect(removedBefore).toBeGreaterThan(0);

    for (let i = 1; i <= 25; i++) {
      lifecycle.removeActivateGuard(`route${i}`);
    }

    for (let i = 0; i < 200; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    // The removed guard (route1) must NOT fire again across the 200 follow-up
    // navigations (which still visit route1), while a survivor (route40) must
    // keep firing. This directly discriminates removeActivateGuard — the old
    // bare heap line was hard-capped (Map last-add-wins) and couldn't.
    expect(calls[1]).toBe(removedBefore);
    expect(calls[40]).toBeGreaterThan(survivorBefore);
  }, 30_000);

  it("S20.2: removeActivateGuard() during guard execution — 50 cycles, self-removal works", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    for (let cycle = 0; cycle < 50; cycle++) {
      let guardExecuted = false;

      lifecycle.addActivateGuard("route1", () => () => {
        if (!guardExecuted) {
          guardExecuted = true;
          lifecycle.removeActivateGuard("route1");
        }

        return true;
      });

      await router.navigate("route1");

      // The guard ran (removing itself mid-execution) and still allowed the
      // navigation through — route1 must be the committed state.
      expect(guardExecuted).toBe(true);
      expect(router.getState()?.name).toBe("route1");

      await router.navigate("route2");

      expect(router.getState()?.name).toBe("route2");
    }
  }, 30_000);

  it("S20.3: 100 cycles add/remove all guards — removal fully clears guard storage", async () => {
    const routeCount = 5000;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    let lastTarget = 0;

    for (let cycle = 0; cycle < 100; cycle++) {
      for (let i = 1; i < routeCount; i++) {
        lifecycle.addActivateGuard(`route${i}`, () => () => true);
      }

      const target1 = (cycle % (routeCount - 1)) + 1;

      await router.navigate(`route${target1}`);

      for (let i = 1; i < routeCount; i++) {
        lifecycle.removeActivateGuard(`route${i}`);
      }

      lastTarget = ((cycle + 5) % (routeCount - 1)) + 1;

      await router.navigate(`route${lastTarget}`);
    }

    // The final navigation committed correctly...
    expect(router.getState()?.name).toBe(`route${lastTarget}`);

    // ...and after the last remove-all the activate-guard storage is EMPTY — a
    // removeActivateGuard that leaked even one generation would leave entries
    // here. This is the discriminating count the old hard-capped heap line
    // (Map last-add-wins → bounded to one generation) could never catch.
    const [, activateFactories] = getInternals(router).getLifecycleFactories();

    expect(Object.keys(activateFactories)).toHaveLength(0);
  }, 30_000);
});
