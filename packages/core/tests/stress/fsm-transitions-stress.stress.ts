import { describe, it, expect } from "vitest";

import {
  createStressRouter,
  formatBytes,
  MB,
  measureTime,
  takeHeapSnapshot,
} from "./helpers";

describe("S8: FSM transitions", () => {
  it("S8.1: start → 500 navigate → stop → start → 500 navigate — isActive() always correct", async () => {
    const router = createStressRouter(10);

    expect(router.isActive()).toBe(false);

    await router.start("/route0");

    expect(router.isActive()).toBe(true);

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    router.stop();

    expect(router.isActive()).toBe(false);

    await router.start("/route0");

    expect(router.isActive()).toBe(true);

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    expect(router.isActive()).toBe(true);

    router.stop();
    router.dispose();
  }, 60_000);

  it("S8.2: 200 fire-and-forget navigate() — only last one succeeds", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const successes: string[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 200; i++) {
      const target = `route${(i % 9) + 1}`;

      promises.push(
        router
          .navigate(target)
          .then((s) => {
            successes.push(s.name);

            return;
          })
          .catch(() => {
            return;
          }),
      );
    }

    await Promise.all(promises);

    const lastTarget = `route${(199 % 9) + 1}`;

    expect(successes).toHaveLength(1);
    expect(successes[0]).toBe(lastTarget);

    router.stop();
    router.dispose();
  }, 30_000);

  it("S8.3: 1000 transition cycles — heap stable", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `heap grew by ${formatBytes(delta)}`).toBeLessThan(10 * MB);

    router.stop();
    router.dispose();
  }, 60_000);

  it("S8.4: router.isActive() 10,000 calls — O(1), under 50ms total", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const { durationMs } = measureTime(() => {
      for (let i = 0; i < 10_000; i++) {
        router.isActive();
      }
    });

    expect(durationMs).toBeLessThan(50);

    router.stop();
    router.dispose();
  });
});
