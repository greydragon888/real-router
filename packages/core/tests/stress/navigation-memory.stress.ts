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

// IMPORTANT — what these tests do and do NOT guard:
//  - The heap deltas are THROUGHPUT guards, not leak detectors. Navigation has
//    no test-side cleanup to skip, and the only simulatable leak ("core retains
//    one State per navigation", ~335 B/nav measured) is, at these iteration
//    counts, the same order as healthy heap noise (~5-18x headroom). A heap
//    snapshot therefore cannot discriminate that leak here.
//  - The DISCRIMINATING per-nav state-retention leak is validated elsewhere:
//    guards-stress S5.3 retains every state at N=20k (leak ~7 MB vs healthy
//    ~0.48 MB, 2 MB threshold between) and trips on the mutation.
//  - So each test below also asserts NAVIGATION CORRECTNESS (the committed state
//    after the churn), which the bare heap line never did — that is the real
//    discriminating power; the heap line stays as a cheap catastrophe ceiling.
describe("S1. Navigation memory / throughput", () => {
  it("should stay correct + bounded during 1,000 simple navigations between 2 routes", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(i % 2 === 0 ? "route1" : "route0");
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Last navigation (i=999, odd) targets route0 — correctness invariant.
    expect(router.getState()?.name).toBe("route0");
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });

  it("should stay correct + bounded during 2,000 round-robin navigations across 10 routes", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 2000; i++) {
      await router.navigate(`route${(i + 1) % 10}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Last navigation (i=1999) targets route${2000 % 10} = route0.
    expect(router.getState()?.name).toBe("route0");
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });

  it("should stay correct + bounded during 1,000 navigations with unique params", async () => {
    const routes = createParamRoutes(5);
    const router = createRouter(routes, { defaultRoute: "routeP0" });

    await router.start("/routeP0/start");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`routeP${i % 5}`, { id: String(i) });
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Last navigation (i=999) → routeP4 with id "999".
    expect(router.getState()?.name).toBe("routeP4");
    expect(router.getState()?.params.id).toBe("999");
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });

  it("should resolve all 500 fire-and-forget navigations and stay functional", async () => {
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

    // After the concurrent storm settles the router is still fully functional —
    // a fresh navigation commits correctly (concurrent navs supersede each
    // other, so the final committed target is racy; this is the deterministic
    // post-condition).
    await router.navigate("route3").catch(() => {});

    expect(router.getState()?.name).toBe("route3");
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });

  it("should stay correct + bounded during 500 navigations through forwardTo redirect chains", async () => {
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

    // Last navigation (i=499) → targets[499 % 5 = 4] = "home". (Redirect
    // resolution itself is exercised every 5th iter via redirectA→home /
    // redirectB→about and asserted by forward-to-chains; here the invariant is
    // the committed terminal route after the churn.)
    expect(router.getState()?.name).toBe("home");
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });
});
