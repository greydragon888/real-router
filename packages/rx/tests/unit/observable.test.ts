import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { observable, RxObservable } from "../../src";

import type { Router } from "@real-router/core";

describe("observable()", () => {
  let router: Router;

  const routes = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ];

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("should return an RxObservable instance", () => {
    const obs = observable(router);

    expect(obs).toBeInstanceOf(RxObservable);
  });

  it("should have Symbol.observable property", () => {
    const obs = observable(router);

    expect(obs[Symbol.observable]).toBeDefined();
    expect(typeof obs[Symbol.observable]).toBe("function");
  });

  it("should have @@observable property", () => {
    const obs = observable(router);

    expect(obs["@@observable"]).toBeDefined();
    expect(typeof obs["@@observable"]).toBe("function");
  });

  it("should emit state changes on navigation", async () => {
    const states: any[] = [];

    observable(router).subscribe({
      next: (state) => states.push(state),
    });

    await router.start("/");
    await router.navigate("about");

    expect(states.length).toBeGreaterThanOrEqual(2);
    expect(states[0].route.name).toBe("home");
    expect(states[1].route.name).toBe("about");
  });

  it("should emit with previousRoute on navigation", async () => {
    const states: any[] = [];

    observable(router).subscribe({
      next: (state) => states.push(state),
    });

    await router.start("/");
    await router.navigate("about");

    expect(states[1].previousRoute.name).toBe("home");
    expect(states[1].route.name).toBe("about");
  });

  it("should work with RxJS from() pattern", async () => {
    const states: any[] = [];

    // Simulate RxJS from() behavior
    const obs = observable(router);
    const rxjsObs = obs[Symbol.observable]();

    rxjsObs.subscribe({
      next: (state) => states.push(state),
    });

    await router.start("/");
    await router.navigate("about");

    expect(states.length).toBeGreaterThanOrEqual(2);
  });

  it("should support unsubscribe", async () => {
    const states: any[] = [];

    const subscription = observable(router).subscribe({
      next: (state) => states.push(state),
    });

    await router.start("/");
    await router.navigate("about");

    const countAfterFirst = states.length;

    subscription.unsubscribe();

    await router.navigate("home");

    expect(states).toHaveLength(countAfterFirst);
  });

  it("should emit initial state on subscription", async () => {
    await router.start("/");

    const states: any[] = [];

    observable(router).subscribe({
      next: (state) => states.push(state),
    });

    // Should emit current state asynchronously
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(states.length).toBeGreaterThanOrEqual(1);
    expect(states[0].route.name).toBe("home");
  });

  it("should handle multiple subscriptions independently", async () => {
    const states1: any[] = [];
    const states2: any[] = [];

    observable(router).subscribe({
      next: (state) => states1.push(state),
    });

    observable(router).subscribe({
      next: (state) => states2.push(state),
    });

    await router.start("/");
    await router.navigate("about");

    expect(states1.length).toBeGreaterThanOrEqual(2);
    expect(states2.length).toBeGreaterThanOrEqual(2);
  });
});
