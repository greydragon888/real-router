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

import { createStressRouter, waitForTransitions, noop } from "./helpers";

import type { StressRouterResult } from "./helpers";
import type { Router } from "@real-router/core";

describe("N4 — Cannot Deactivate Storm", () => {
  let router: Router;
  let mockNav: StressRouterResult["mockNav"];
  let browser: StressRouterResult["browser"];
  let unsubscribe: StressRouterResult["unsubscribe"];

  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    const result = createStressRouter({ forceDeactivate: false });

    ({ router, mockNav, browser, unsubscribe } = result);
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

  it("4.1 — 50 navigate events blocked by canDeactivate=false: router state unchanged", async () => {
    getLifecycleApi(router).addDeactivateGuard("users.list", () => () => false);

    for (let i = 0; i < 50; i++) {
      mockNav.navigate("http://localhost/home");
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("users.list");
  });

  it("4.2 — alternating allow/block guard × 50: no stuck transitions", async () => {
    let counter = 0;

    getLifecycleApi(router).addDeactivateGuard(
      "users.list",
      () => () => counter++ % 2 === 0,
    );

    router.subscribe(noop);

    for (let i = 0; i < 50; i++) {
      mockNav.navigate("http://localhost/home");
    }

    await waitForTransitions();

    expect(router.getState()).toBeDefined();
    // At least one navigate event reached the guard — MockNavigation may
    // deduplicate identical consecutive events (same URL), but the counter
    // must move. Upper bound is the event count.
    expect(counter).toBeGreaterThan(0);
    expect(counter).toBeLessThanOrEqual(50);
    // Router state must not have been corrupted by the storm.
    expect(["home", "users.list"]).toContain(router.getState()?.name);
  });

  it("4.3 — 50 navigate events with TypeError: error recovery calls browser.navigate", async () => {
    const browserNavigateSpy = vi.spyOn(browser, "navigate");

    vi.spyOn(router, "navigate").mockRejectedValue(
      new TypeError("Guard throws"),
    );

    for (let i = 0; i < 50; i++) {
      mockNav.navigate("http://localhost/home");
    }

    await waitForTransitions();

    expect(browserNavigateSpy).toHaveBeenCalled();
  });

  it("4.4 — double error recovery × 20: no unhandled exceptions", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

    vi.spyOn(router, "navigate").mockRejectedValue(
      new TypeError("Navigate throws"),
    );
    vi.spyOn(router, "buildUrl").mockImplementation(() => {
      throw new Error("BuildUrl throws");
    });

    for (let i = 0; i < 20; i++) {
      mockNav.navigate("http://localhost/home");
    }

    await waitForTransitions();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to recover"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
