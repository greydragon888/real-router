import { describe, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  fullPluginFactory,
  MB,
  takeHeapSnapshot,
} from "./helpers";

const createFullPlugin = () => () => fullPluginFactory();

const alwaysAllowGuardFn = () => true;

const alwaysAllowGuard = () => alwaysAllowGuardFn;

// Resolves true if a mutating call on a disposed router is rejected/throws.
// Works whether the method throws synchronously or returns a rejected promise.
async function disposedMutationRejects(router: {
  navigate: (name: string) => Promise<unknown>;
}): Promise<boolean> {
  try {
    await router.navigate("route0");

    return false;
  } catch {
    return true;
  }
}

describe("S4. Router dispose completeness", () => {
  it("should advance + dispose 100 routers; create→dispose loop heap stays bounded (throughput)", async () => {
    const before = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(10);

      await router.start("/route0");
      await router.navigate("route1");

      // Each router actually advances to route1 before being torn down...
      expect(router.getState()?.name).toBe("route1");

      router.dispose();

      // ...and dispose really terminates it (mutating now rejects).
      await expect(disposedMutationRejects(router)).resolves.toBe(true);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // create→dispose loop: each router is dropped and GC-reclaimed regardless of
    // dispose correctness, so this is a throughput/catastrophe guard — dispose
    // correctness is asserted by the disposed-rejects check above.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);
  });

  it("should fully tear down a router loaded with 10 plugins, 50 listeners, and 20 guards", async () => {
    const before = takeHeapSnapshot();

    const router = createStressRouter(10);
    const lifecycle = getLifecycleApi(router);

    for (let i = 0; i < 10; i++) {
      router.usePlugin(createFullPlugin());
    }

    for (let l = 0; l < 50; l++) {
      router.subscribe(() => {});
    }

    for (let g = 0; g < 20; g++) {
      lifecycle.addActivateGuard(`route${g % 10}`, alwaysAllowGuard);
    }

    await router.start("/route0");
    await router.navigate("route1");

    expect(router.getState()?.name).toBe("route1");

    router.dispose();

    // A heavily-loaded router is genuinely terminated: no longer active and
    // mutating it rejects. (The single router is dropped at function end, so a
    // heap snapshot can't see whether internals were freed — the functional
    // checks below carry the discrimination; heap stays a throughput guard.)
    expect(router.isActive()).toBe(false);
    await expect(disposedMutationRejects(router)).resolves.toBe(true);

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);
  });

  it("should cancel the in-flight navigation when disposed mid-transition × 50", async () => {
    const before = takeHeapSnapshot();

    for (let i = 0; i < 50; i++) {
      const router = createStressRouter(5);
      const lifecycle = getLifecycleApi(router);

      // Async activate guard forces navigate("route4") onto the async path so it
      // is genuinely IN-FLIGHT when dispose() runs (a guard-less navigation
      // would complete synchronously before dispose, so the old test never
      // actually exercised "dispose during navigation").
      lifecycle.addActivateGuard("route4", () => () => Promise.resolve(true));

      await router.start("/route0");

      const navigationPromise = router.navigate("route4");

      router.dispose();

      // dispose() aborts the in-flight transition → the promise must reject
      // (the navigation must NOT silently succeed on a disposed router). The old
      // test only `.catch`-swallowed it and asserted heap, so a dispose that
      // failed to cancel would have passed.
      let rejected = false;

      await navigationPromise.catch(() => {
        rejected = true;
      });

      expect(rejected).toBe(true);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Throughput guard (create→dispose loop is GC-masked); the cancellation
    // invariant above is what discriminates.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(
      512 * 1024,
    );
  });

  it("should be idempotent — double dispose 100 times should not throw", async () => {
    const before = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");
      router.dispose();

      expect(() => {
        router.dispose();
      }).not.toThrow();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Throughput guard (create→dispose loop); idempotency is asserted above.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);
  });
});
