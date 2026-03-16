import { describe, it, expect, vi } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

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

  it("S8.2: 200 concurrent navigate() with async guards — only last succeeds", async () => {
    vi.useFakeTimers();

    const router = createStressRouter(10);

    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    for (let i = 1; i < 10; i++) {
      lifecycle.addActivateGuard(
        `route${i}`,
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 10),
          ),
      );
    }

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

    await vi.runAllTimersAsync();
    await Promise.all(promises);

    const lastTarget = `route${(199 % 9) + 1}`;

    expect(successes).toHaveLength(1);
    expect(successes[0]).toBe(lastTarget);

    router.stop();
    router.dispose();
    vi.useRealTimers();
  }, 30_000);

  it("S8.2a: 200 sync navigate() — all succeed, final state correct", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const successes: string[] = [];

    for (let i = 0; i < 200; i++) {
      const target = `route${(i % 9) + 1}`;
      const state = await router.navigate(target);

      successes.push(state.name);
    }

    const lastTarget = `route${(199 % 9) + 1}`;

    expect(successes).toHaveLength(200);
    expect(router.getState()!.name).toBe(lastTarget);

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

  it("S8.4: 500 sync navigate() — heap stable, no leaked controllers", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);

    router.stop();
    router.dispose();
  }, 30_000);

  it("S8.5: router.isActive() 10,000 calls — O(1), under 50ms total", async () => {
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
