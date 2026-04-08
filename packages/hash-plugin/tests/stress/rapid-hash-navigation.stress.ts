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

describe("H1 -- Rapid Hash Navigation", () => {
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

  it("H1.1 -- 200 sequential navigate() calls: final state correct", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 200; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    expect(router.getState()?.name).toBe("users.list");
  });

  it("H1.2 -- 200 navigate() calls: pushState called for each", async () => {
    const result = createStressRouter();

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
  });

  it("H1.3 -- 200 navigate with replace: replaceState called for each", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    for (let i = 0; i < 200; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name, {}, { replace: true }).catch(noop);
    }

    expect(replaceStateSpy).toHaveBeenCalledTimes(200);
    expect(router.getState()?.name).toBe("users.list");
  });

  it("H1.4 -- 100 navigate with params: all URLs use hash format", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");

    for (let i = 0; i < 100; i++) {
      await router.navigate("users.view", { id: String(i) }).catch(noop);
    }

    expect(pushStateSpy).toHaveBeenCalledTimes(100);

    for (const [, url] of pushStateSpy.mock.calls) {
      expect(url).toMatch(/^#\//);
    }

    expect(router.getState()?.name).toBe("users.view");
    expect(router.getState()?.params).toStrictEqual({ id: "99" });
  });

  it("H1.5 -- 100 replaceHistoryState calls: state unchanged, URL updated", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const initialState = router.getState();
    const replaceStateSpy = vi.spyOn(browser, "replaceState");

    for (let i = 0; i < 100; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      router.replaceHistoryState(name);
    }

    expect(replaceStateSpy).toHaveBeenCalledTimes(100);
    expect(router.getState()).toStrictEqual(initialState);
  });

  it("H1.6 -- 100 navigate with base path: all URLs prefixed correctly", async () => {
    const result = createStressRouter({ base: "/app" });

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    const pushStateSpy = vi.spyOn(browser, "pushState");

    for (let i = 0; i < 100; i++) {
      const name = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(name).catch(noop);
    }

    expect(pushStateSpy).toHaveBeenCalledTimes(100);

    for (const [, url] of pushStateSpy.mock.calls) {
      expect(url).toMatch(/^\/app#\//);
    }
  });
});
