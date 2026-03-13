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

import { createStressRouter, noop } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

describe("B2 — History State Accumulation", () => {
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

  it("2.1 — 500 navigate() calls: pushState called 500 times", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");

    for (let i = 0; i < 500; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    expect(pushStateSpy).toHaveBeenCalledTimes(500);
    expect(router.getState()?.name).toBe("users.list");
  });

  it("2.2 — 500 navigate({ replace: true }) calls: replaceState called 500 times", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    for (let i = 0; i < 500; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name, {}, { replace: true }).catch(noop);
    }

    expect(replaceStateSpy).toHaveBeenCalledTimes(500);
    expect(router.getState()?.name).toBe("users.list");
  });

  it("2.3 — 500 mixed pushState/replaceState: correct counts per replace flag", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");
    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    for (let i = 0; i < 500; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router
        .navigate(name, {}, i % 2 === 0 ? { replace: true } : {})
        .catch(noop);
    }

    expect(replaceStateSpy).toHaveBeenCalledTimes(250);
    expect(pushStateSpy).toHaveBeenCalledTimes(250);
  });

  it("2.4 — 500 navigate with hash fragment preservation: hash preserved in each URL", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    globalThis.history.replaceState({}, "", "/home#section");
    await router.start();

    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    for (let i = 0; i < 500; i++) {
      await router.navigate("home", {}, { reload: true }).catch(noop);
    }

    expect(replaceStateSpy).toHaveBeenCalledTimes(500);

    for (const [, url] of replaceStateSpy.mock.calls) {
      expect(url).toContain("#section");
    }
  });

  it("2.5 — 200 navigate with base path '/app': all URLs prefixed with '/app'", async () => {
    const result = createStressRouter({ base: "/app" });

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");

    for (let i = 0; i < 200; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    expect(pushStateSpy).toHaveBeenCalledTimes(200);

    for (const [, url] of pushStateSpy.mock.calls) {
      expect(url).toMatch(/^\/app/);
    }
  });

  it("2.6 — 200 replaceHistoryState() calls: replaceState called 200 times, router state unchanged", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const initialState = router.getState();
    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    for (let i = 0; i < 200; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      router.replaceHistoryState(name);
    }

    expect(replaceStateSpy).toHaveBeenCalledTimes(200);
    expect(router.getState()).toStrictEqual(initialState);
  });
});
