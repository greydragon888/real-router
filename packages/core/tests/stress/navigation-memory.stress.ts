import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import {
  createParamRoutes,
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

import type { Route } from "@real-router/core";

// These are catastrophic-leak guards: navigation has no test-side cleanup to
// remove, so the only simulatable leak is "core/app retains one State per
// navigation" (~335 B/nav, measured). At these iteration counts that signal is
// the same order as healthy heap noise, so thresholds are tightened to ~5-18x
// the (rock-stable) healthy delta — catching a moderate per-nav leak without the
// flakiness/runtime cost of inflating navigation counts to 10k+. The
// high-volume retention case is covered by event-listener-memory's 250k-
// invocation test.
describe("S1. Navigation memory leaks", () => {
  it("should not leak memory during 1,000 simple navigations between 2 routes", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(i % 2 === 0 ? "route1" : "route0");
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });

  it("should not leak memory during 2,000 round-robin navigations across 10 routes", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 2000; i++) {
      await router.navigate(`route${(i + 1) % 10}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });

  it("should not leak memory during 1,000 navigations with unique params", async () => {
    const routes = createParamRoutes(5);
    const router = createRouter(routes, { defaultRoute: "routeP0" });

    await router.start("/routeP0/start");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`routeP${i % 5}`, { id: String(i) });
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });

  it("should resolve all 500 fire-and-forget navigations without memory leak", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < 500; i++) {
      promises.push(router.navigate(`route${i % 10}`).catch(() => {}));
    }

    await Promise.all(promises);

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });

  it("should not leak memory during 500 navigations through forwardTo redirect chains", async () => {
    const routes: Route[] = [
      { name: "home", path: "/home" },
      { name: "about", path: "/about" },
      { name: "contact", path: "/contact" },
      { name: "redirectA", path: "/redirectA", forwardTo: "home" },
      { name: "redirectB", path: "/redirectB", forwardTo: "about" },
    ];
    const router = createRouter(routes, { defaultRoute: "home" });

    await router.start("/home");

    const before = takeHeapSnapshot();

    const targets = ["about", "redirectA", "contact", "redirectB", "home"];

    for (let i = 0; i < 500; i++) {
      const target = targets[i % targets.length] ?? "home";

      await router.navigate(target).catch(() => {});
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });
});
