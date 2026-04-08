import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  makePopstateState,
  waitForTransitions,
  roundRobinStates,
  noop,
} from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

const stateTargets = [
  { name: "users.view", params: { id: "1" }, path: "/users/view/1" },
  { name: "users.list", params: {}, path: "/users/list" },
];

describe("H2 -- Popstate Storm (Hash)", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("H2.1 -- 50 rapid-fire sync popstate events: final state = last event, intermediates skipped", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { dispatchPopstate } = result;

    await router.start();

    const transitions: string[] = [];

    router.subscribe(({ route }) => {
      transitions.push(route.name);
    });

    const states = roundRobinStates(50, stateTargets);
    const lastRouteName = stateTargets[(50 - 1) % stateTargets.length].name;

    for (const s of states) {
      dispatchPopstate(s);
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe(lastRouteName);
    expect(transitions.length).toBeLessThan(50);
  });

  it("H2.2 -- 50 popstate events with 100ms async guards: only first and last transition", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { dispatchPopstate } = result;

    await router.start();

    const slowGuard = () => () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 100);
      });

    getLifecycleApi(router).addActivateGuard("users.view", slowGuard);
    getLifecycleApi(router).addActivateGuard("users.list", slowGuard);

    const transitions: string[] = [];

    router.subscribe(({ route }) => {
      transitions.push(route.name);
    });

    const states = roundRobinStates(50, stateTargets);
    const lastRouteName = stateTargets[(50 - 1) % stateTargets.length].name;

    for (const s of states) {
      dispatchPopstate(s);
    }

    await waitForTransitions(500);

    expect(transitions).toHaveLength(2);
    expect(transitions.at(-1)).toBe(lastRouteName);
  });

  it("H2.3 -- 200 alternating popstate events: final state correct, not stuck", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { dispatchPopstate } = result;

    await router.start();

    const states = roundRobinStates(200, stateTargets);
    const lastRouteName = stateTargets[(200 - 1) % stateTargets.length].name;

    for (const s of states) {
      dispatchPopstate(s);
    }

    await waitForTransitions(200);

    expect(router.getState()?.name).toBe(lastRouteName);
    expect(router.isActive()).toBe(true);

    await router.navigate("home").catch(noop);

    expect(router.getState()?.name).toBe("home");
  });

  it("H2.4 -- 50 null-state events with allowNotFound=true: navigateToNotFound called", async () => {
    const result = createStressRouter({ allowNotFound: true });

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { dispatchPopstate } = result;

    await router.start();

    // Set a non-matching hash AFTER start so browser.getLocation() returns it on null-state popstate
    globalThis.history.replaceState({}, "", "/#/nonexistent");

    const spy = vi.spyOn(router, "navigateToNotFound");

    for (let i = 0; i < 50; i++) {
      dispatchPopstate(null);
    }

    await waitForTransitions();

    expect(spy).toHaveBeenCalled();
  });

  it("H2.5 -- 50 same-state popstate events: SAME_STATES suppressed, state stable", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { dispatchPopstate } = result;

    await router.start();
    await router.navigate("home").catch(noop);

    const homeState = makePopstateState("home", {}, "/home");
    const stateBefore = router.getState();

    for (let i = 0; i < 50; i++) {
      dispatchPopstate(homeState);
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("home");
    expect(router.getState()).toStrictEqual(stateBefore);
  });
});
