import { describe, it, expect } from "vitest";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

describe("S2. Event listener memory leaks", () => {
  it("should not leak memory during 10,000 add/remove cycles of a single listener", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      const unsub = router.subscribe(() => {});

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });

  it("should release all memory after registering and removing 1,000 unique listeners", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 1000; i++) {
      unsubs.push(router.subscribe(() => {}));
    }

    for (const unsub of unsubs) {
      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);

    router.stop();
    router.dispose();
  });

  it("should not leak memory simulating React mount/unmount with 10 components × 100 cycles", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let cycle = 0; cycle < 100; cycle++) {
      const componentUnsubs: (() => void)[] = [];

      for (let comp = 0; comp < 10; comp++) {
        componentUnsubs.push(router.subscribe(() => {}));
      }
      for (const unsub of componentUnsubs) {
        unsub();
      }
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);

    router.stop();
    router.dispose();
  });

  it("should handle 250,000 listener invocations (50 listeners × 5,000 navigations) without OOM", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    let invocations = 0;
    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 50; i++) {
      unsubs.push(
        router.subscribe(() => {
          invocations++;
        }),
      );
    }

    const before = takeHeapSnapshot();

    for (let i = 0; i < 5000; i++) {
      await router.navigate(`route${(i % 4) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(invocations).toBe(250_000);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(10 * MB);

    for (const unsub of unsubs) {
      unsub();
    }

    router.stop();
    router.dispose();
  });

  it("should not leak memory during 1,000 cycles of interleaved subscribe/navigate/unsubscribe", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      const unsub = router.subscribe(() => {});

      await router.navigate(`route${(i % 4) + 1}`).catch(() => {});
      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);

    router.stop();
    router.dispose();
  });
});
