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

describe("memory smoke tests", () => {
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

  it("1000 hover cycles complete without error", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    for (let i = 0; i < 1000; i++) {
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
      fireMouseOver(div);
    }

    expect(preloadFn).toHaveBeenCalledTimes(1000);

    router.stop();
  });

  it("100 usePlugin/start/stop/unsubscribe cycles complete without error", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(preloadPluginFactory());

      await router.start("/");

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      // Move away before stop to avoid stale timer references
      fireMouseOver(div);

      router.stop();
      unsub();
    }

    expect(preloadFn).toHaveBeenCalledTimes(100);
  });

  it("50 full router lifecycles complete without error", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 50; i++) {
      const r = createStressRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);
      const unsub = r.usePlugin(preloadPluginFactory());

      await r.start("/");

      const anchor = createAnchor("/");
      const div = document.createElement("div");

      document.body.append(div);

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      // Move away before stop
      fireMouseOver(div);

      r.stop();
      unsub();
      cleanupDOM();
    }

    expect(preloadFn).toHaveBeenCalledTimes(50);
  });
});
