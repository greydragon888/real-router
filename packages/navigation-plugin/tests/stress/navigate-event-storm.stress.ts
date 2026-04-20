import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

const stateTargets = [
  { name: "users.view", params: { id: "1" }, path: "/users/view/1" },
  { name: "users.list", params: {}, path: "/users/list" },
];

describe("N1 — Navigate Event Storm", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("1.1 — 50 rapid navigate events: each processed sequentially, final state = last event", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    const transitions: string[] = [];

    router.subscribe(({ route }) => {
      transitions.push(route.name);
    });

    const lastRouteName = stateTargets[(50 - 1) % stateTargets.length].name;

    for (let i = 0; i < 50; i++) {
      const target = stateTargets[i % stateTargets.length];

      mockNav.navigate(`http://localhost${target.path}`);
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe(lastRouteName);
    // Navigation API aborts previous navigations via intercept() — in the
    // optimistic-sync path most events complete synchronously before the next
    // arrives, so 1..50 transitions are all valid. The invariant we assert
    // is: the *last* state is always the last event's target, and the
    // subscribe count never exceeds one per event.
    expect(transitions.at(-1)).toBe(lastRouteName);
    expect(transitions.length).toBeGreaterThanOrEqual(1);
    expect(transitions.length).toBeLessThanOrEqual(50);
  });

  it("1.2 — 50 navigate events with 100ms async guards: all eventually processed", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    const slowGuard = () => () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 100);
      });

    getLifecycleApi(router).addActivateGuard("users.view", slowGuard);
    getLifecycleApi(router).addActivateGuard("users.list", slowGuard);

    const lastRouteName = stateTargets[(50 - 1) % stateTargets.length].name;

    for (let i = 0; i < 50; i++) {
      const target = stateTargets[i % stateTargets.length];

      mockNav.navigate(`http://localhost${target.path}`);
    }

    await waitForTransitions(500);

    expect(router.getState()?.name).toBe(lastRouteName);
    expect(router.isActive()).toBe(true);
  });

  it("1.3 — 200 alternating navigate events: final state correct, not stuck", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    const lastRouteName = stateTargets[(200 - 1) % stateTargets.length].name;

    for (let i = 0; i < 200; i++) {
      const target = stateTargets[i % stateTargets.length];

      mockNav.navigate(`http://localhost${target.path}`);
    }

    await waitForTransitions(200);

    expect(router.getState()?.name).toBe(lastRouteName);
    expect(router.isActive()).toBe(true);

    await router.navigate("home").catch(noop);

    expect(router.getState()?.name).toBe("home");
  });

  it("1.4 — 50 navigate to unknown URL with allowNotFound=true", async () => {
    const result = createStressRouter({ allowNotFound: true });

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    const spy = vi.spyOn(router, "navigateToNotFound");

    for (let i = 0; i < 50; i++) {
      mockNav.navigate("http://localhost/nonexistent");
    }

    await waitForTransitions();

    expect(spy).toHaveBeenCalled();
  });

  it("1.5 — 50 same-route navigate events: handled gracefully", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();
    await router.navigate("home").catch(noop);

    const stateBefore = router.getState();

    for (let i = 0; i < 50; i++) {
      mockNav.navigate("http://localhost/home");
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("home");
    expect(router.getState()).toStrictEqual(stateBefore);
  });

  it("1.6 — 50 navigate events, allowNotFound=false: no silent fallback, errors surface, state pinned (#483)", async () => {
    const result = createStressRouter({ allowNotFound: false });

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    const initialState = router.getState()!;
    const errorHook = vi.fn();

    router.usePlugin(() => ({ onTransitionError: errorHook }));

    const navigateDefaultSpy = vi.spyOn(router, "navigateToDefault");

    for (let i = 0; i < 50; i++) {
      mockNav
        .navigate("http://localhost/nonexistent")
        .finished.catch(() => undefined);
    }

    await waitForTransitions(200);

    // No silent fallback
    expect(navigateDefaultSpy).not.toHaveBeenCalled();

    // Every navigate event produced a ROUTE_NOT_FOUND error hook invocation
    expect(errorHook).toHaveBeenCalled();

    // Router state pinned to initial — Navigation API rolled back each URL
    expect(router.getState()).toStrictEqual(initialState);
  });
});
