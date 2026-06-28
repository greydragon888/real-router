import { describe, it, expect } from "vitest";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

describe("S2. Event listener memory leaks", () => {
  it("should not leak memory during 9,000 add/remove cycles of a single listener", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 9000; i++) {
      const unsub = router.subscribe(() => {});

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Healthy (cleanup runs): ~36 KB. Leak (skip unsub): ~1.6 MB (9,000 live
    // listeners). Threshold sits >3x below the leak and ~14x above healthy
    // (mutation-validated 2026-06-22: healthy 35.9 KB, threshold 0.5 MB, leak 1.6 MB).
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });

  it("should release all memory after registering and removing 9,000 unique listeners", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 9000; i++) {
      unsubs.push(router.subscribe(() => {}));
    }

    for (const unsub of unsubs) {
      unsub();
    }

    // Drop references to the unsub closures + backing array so the measured
    // delta reflects listeners retained by the emitter, not this scratch array.
    unsubs.length = 0;

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Healthy (cleanup runs): ~10 KB. Leak (skip unsub loop): ~1.6 MB.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });

  it("should not leak memory simulating React mount/unmount with 10 components × 900 cycles", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let cycle = 0; cycle < 900; cycle++) {
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

    // 900 × 10 = 9,000 subscriptions. Healthy (cleanup runs): ~10 KB. Leak
    // (skip the inner unsub loop): ~1.6 MB of retained listeners.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

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

  it("should not leak memory during 9,000 add/remove cycles of a single subscribeLeave listener", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 9000; i++) {
      const unsub = router.subscribeLeave(() => {});

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // subscribeLeave listeners live in a FLAT array (`#leaveListeners`) with NO
    // hard cap (unlike the EventEmitter's add/remove path the tests above cover),
    // so a broken unsubscribe would grow it without bound. Mutation-validated
    // 2026-06-28: healthy (cleanup runs) ~28 KB, leak (skip unsub → 9,000 live
    // closures) ~597 KB. Threshold 0.15 MB sits >3x below the leak (×3.9) and
    // >3x above healthy (×5.5).
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.15 * MB);

    router.stop();
    router.dispose();
  });

  it("should not leak memory during 9,000 cycles of interleaved subscribe/navigate/unsubscribe", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 9000; i++) {
      const unsub = router.subscribe(() => {});

      await router.navigate(`route${(i % 4) + 1}`).catch(() => {});
      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Healthy (cleanup runs): ~390 KB of inherent retained navigation state.
    // Leak (skip unsub): ~1.9 MB. The fixed navigation baseline caps the
    // achievable margin (~2x each side) — narrower than the pure-subscribe
    // tests above, but still strictly discriminating between the two regimes.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(
      0.875 * MB,
    );

    router.stop();
    router.dispose();
  });
});
