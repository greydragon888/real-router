import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";

import {
  createStressRouter,
  makePopstateState,
  waitForTransitions,
  noop,
} from "./helpers";

import type { StressRouterResult } from "./helpers";
import type { Router } from "@real-router/core";

describe("B4 — Cannot Deactivate Storm", () => {
  let router: Router;
  let browser: StressRouterResult["browser"];
  let dispatchPopstate: StressRouterResult["dispatchPopstate"];
  let unsubscribe: StressRouterResult["unsubscribe"];

  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    globalThis.history.replaceState({}, "", "/");

    const result = createStressRouter({ forceDeactivate: false });

    ({ router, browser, dispatchPopstate, unsubscribe } = result);
    await router.start();
    await router.navigate("users.list");
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("4.1 — 50 popstate blocked by canDeactivate=false: RouterError ignored, router state unchanged", async () => {
    getLifecycleApi(router).addDeactivateGuard("users.list", () => () => false);

    for (let i = 0; i < 50; i++) {
      dispatchPopstate(makePopstateState("home", {}, "/home", i));
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("users.list");
  });

  it("4.2 — alternating allow/block guard × 50 popstate: no stuck transitions", async () => {
    let counter = 0;

    getLifecycleApi(router).addDeactivateGuard(
      "users.list",
      () => () => counter++ % 2 === 0,
    );

    router.subscribe(noop);

    for (let i = 0; i < 50; i++) {
      const targetName = i % 2 === 0 ? "home" : "users.list";
      const path = i % 2 === 0 ? "/home" : "/users/list";
      const popState = makePopstateState(targetName, {}, path, i);

      dispatchPopstate(popState);
    }

    await waitForTransitions();

    expect(router.getState()).toBeDefined();
    expect(counter).toBeGreaterThan(0);
  });

  it("4.3 — async guard (TypeError) × 50 popstate: recoverFromCriticalError calls replaceState", async () => {
    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    vi.spyOn(router, "navigate").mockRejectedValue(
      new TypeError("Guard throws"),
    );

    for (let i = 0; i < 50; i++) {
      dispatchPopstate(makePopstateState("home", {}, "/home", i));
    }

    await waitForTransitions();

    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it("4.4 — critical error in recovery × 20: console.error logged, no unhandled exceptions", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

    vi.spyOn(router, "navigate").mockRejectedValue(
      new TypeError("Navigate throws"),
    );
    vi.spyOn(router, "buildUrl").mockImplementation(() => {
      throw new Error("BuildUrl throws");
    });

    for (let i = 0; i < 20; i++) {
      dispatchPopstate(makePopstateState("home", {}, "/home", i));
    }

    await waitForTransitions();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to recover"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
