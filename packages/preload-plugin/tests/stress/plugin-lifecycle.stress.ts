import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  createAnchor,
  cleanupDOM,
  fireMouseOver,
  noop,
} from "./helpers";
import { preloadPluginFactory } from "../../src";

import type { Router } from "@real-router/core";

let router: Router;

describe("S -- Plugin Lifecycle Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupDOM();
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("100 start/stop cycles with listeners cleanup", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);
    router.usePlugin(preloadPluginFactory());

    const anchor = createAnchor("/");

    for (let i = 0; i < 100; i++) {
      await router.start("/");

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      router.stop();
    }

    expect(preloadFn).toHaveBeenCalledTimes(100);

    // After final stop, hover should not trigger preload
    preloadFn.mockClear();
    fireMouseOver(anchor);
    await vi.advanceTimersByTimeAsync(65);

    expect(preloadFn).not.toHaveBeenCalled();
  });

  it("50 usePlugin/unsubscribe cycles with start/stop", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    const anchor = createAnchor("/");

    for (let i = 0; i < 50; i++) {
      const unsub = router.usePlugin(preloadPluginFactory());

      await router.start("/");

      expect("getPreloadSettings" in router).toBe(true);

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      router.stop();
      unsub();

      expect("getPreloadSettings" in router).toBe(false);
    }

    expect(preloadFn).toHaveBeenCalledTimes(50);
  });

  it("1 factory → 50 router instances → all stopped", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const factory = preloadPluginFactory();

    for (let i = 0; i < 50; i++) {
      const r = createStressRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);

      r.usePlugin(factory);
      await r.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      r.stop();

      cleanupDOM();
    }

    expect(preloadFn).toHaveBeenCalledTimes(50);
  });

  it("2 routers same document, independent preloads", async () => {
    const preloadA = vi.fn().mockResolvedValue(undefined);
    const preloadB = vi.fn().mockResolvedValue(undefined);

    const router1 = createStressRouter([
      { name: "home", path: "/", preload: () => preloadA },
    ]);
    const router2 = createStressRouter([
      { name: "home", path: "/", preload: () => preloadB },
    ]);

    const unsub1 = router1.usePlugin(preloadPluginFactory());
    const unsub2 = router2.usePlugin(preloadPluginFactory());

    await router1.start("/");
    await router2.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await vi.advanceTimersByTimeAsync(65);

    // Both routers receive the hover event
    expect(preloadA).toHaveBeenCalledTimes(1);
    expect(preloadB).toHaveBeenCalledTimes(1);

    // Stop router1 — only router2 responds
    router1.stop();

    preloadA.mockClear();
    preloadB.mockClear();

    // Reset currentAnchor by hovering a div
    const div = document.createElement("div");

    document.body.append(div);
    fireMouseOver(div);

    fireMouseOver(anchor);
    await vi.advanceTimersByTimeAsync(65);

    expect(preloadA).not.toHaveBeenCalled();
    expect(preloadB).toHaveBeenCalledTimes(1);

    router2.stop();
    unsub1();
    unsub2();

    router = router1; // for afterEach cleanup safety
  });
});
