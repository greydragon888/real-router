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
  takeHeapSnapshot,
  formatBytes,
  MB,
  noop,
} from "./helpers";
import { preloadPluginFactory } from "../../src";

describe("S -- Memory Leak Detection", () => {
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

  it("1000 hover cycles, heap delta < 5 MB", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    // Warmup
    for (let i = 0; i < 10; i++) {
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
      fireMouseOver(div);
    }

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
      fireMouseOver(div);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(10 * MB);

    router.stop();
  });

  it("100 usePlugin/start/stop/unsubscribe cycles, heap delta < 10 MB", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const router = createStressRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    const anchor = createAnchor("/");

    // Warmup
    for (let i = 0; i < 5; i++) {
      const unsub = router.usePlugin(preloadPluginFactory());

      await router.start("/");
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
      router.stop();
      unsub();
    }

    const before = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(preloadPluginFactory());

      await router.start("/");
      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);
      router.stop();
      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(10 * MB);
  });

  it("50 full router lifecycles, heap delta < 5 MB", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    // Warmup
    for (let i = 0; i < 3; i++) {
      const r = createStressRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);
      const unsub = r.usePlugin(preloadPluginFactory());

      await r.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      r.stop();
      unsub();
      cleanupDOM();
    }

    const before = takeHeapSnapshot();

    for (let i = 0; i < 50; i++) {
      const r = createStressRouter([
        { name: "home", path: "/", preload: () => preloadFn },
      ]);
      const unsub = r.usePlugin(preloadPluginFactory());

      await r.start("/");

      const anchor = createAnchor("/");

      fireMouseOver(anchor);
      await vi.advanceTimersByTimeAsync(65);

      r.stop();
      unsub();
      cleanupDOM();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(10 * MB);
  });
});
