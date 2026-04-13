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
  createAnchors,
  cleanupDOM,
  fireMouseOver,
  fireTouchStart,
  fireTouchMove,
  noop,
} from "./helpers";
import { preloadPluginFactory } from "../../src";

import type { Router } from "@real-router/core";

const TOUCH_PRELOAD_DELAY = 100;

let router: Router;

describe("S -- Rapid Event Stress", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    router.stop();
    cleanupDOM();
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("1000 rapid hover switches, only last preload fires", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
      {
        name: "users",
        path: "/users",
        children: Array.from({ length: 100 }, (_, i) => ({
          name: `user${i}`,
          path: `/${i}`,
          preload: () => preloadFn,
        })),
      },
    ]);
    router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchors = createAnchors(
      Array.from({ length: 1000 }, (_, i) => `/users/${i % 100}`),
    );

    // Fire 1000 mouseoveros without advancing — each cancels the previous
    for (const anchor of anchors) {
      fireMouseOver(anchor);
    }

    await vi.advanceTimersByTimeAsync(65);

    // Only last preload fires (debounce cancels all previous)
    expect(preloadFn).toHaveBeenCalledTimes(1);
  });

  it("200 touchstart/touchmove cancel cycles", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);
    router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    for (let i = 0; i < 200; i++) {
      fireTouchStart(anchor, 100);
      fireTouchMove(anchor, 120); // deltaY=20 > threshold=10 → cancel
    }

    await vi.advanceTimersByTimeAsync(TOUCH_PRELOAD_DELAY);

    // All touch preloads cancelled by scroll
    expect(preloadFn).not.toHaveBeenCalled();
  });

  it("100 hover-advance-hover cycles, each preload fires", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);
    router.usePlugin(preloadPluginFactory({ delay: 0 }));
    await router.start("/");

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    for (let i = 0; i < 100; i++) {
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(1);
      // Move away to reset currentAnchor
      fireMouseOver(div);
    }

    expect(preloadFn).toHaveBeenCalledTimes(100);
  });

  it("500 ghost event pairs suppressed under load", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);
    router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    for (let i = 0; i < 500; i++) {
      fireTouchStart(anchor);
      await vi.advanceTimersByTimeAsync(TOUCH_PRELOAD_DELAY);
      // Ghost mouseover on same target within 2500ms
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
    }

    // Touch preloads fired 500 times, mouseover always suppressed
    expect(preloadFn).toHaveBeenCalledTimes(500);
  });
});
