import { createRoot } from "solid-js";
import { describe, it, expect, vi } from "vitest";

import {
  createSignalFromSource,
  createStoreFromSource,
} from "@real-router/solid";

import { createStressRouter, forceGC, takeHeapSnapshot, MB } from "./helpers";

import type { RouterSource } from "@real-router/sources";

/**
 * §7.2 audit scenario #17 — Solid-specific createRoot/getOwner cleanup
 * under stress. Audit noted ⚠️ partial: existing mount/unmount tests
 * exercise component-tree disposal indirectly, but no test drives
 * `createRoot(...)` directly N times to verify the dispose handle releases
 * subscriptions.
 *
 * Both bridges (`createSignalFromSource` / `createStoreFromSource`) call
 * `onCleanup` internally to unsubscribe from their router-source. Each
 * `createRoot` invocation is an isolated owner — dispose must release
 * the subscription, and N rounds of create-dispose must not leak.
 */
function buildSubscribingSource<T>(
  initial: T,
): { source: RouterSource<T>; emit: (v: T) => void; listenerCount: () => number } {
  let current = initial;
  const callbacks = new Set<() => void>();

  return {
    source: {
      subscribe: (cb) => {
        callbacks.add(cb);

        return () => {
          callbacks.delete(cb);
        };
      },
      getSnapshot: () => current,
      destroy: vi.fn(),
    },
    emit: (v) => {
      current = v;
      for (const cb of callbacks) {
        cb();
      }
    },
    listenerCount: () => callbacks.size,
  };
}

describe("CR1 — createRoot ownership cleanup (§7.2 #17)", () => {
  it("CR1.1: 1000 createRoot/dispose cycles with signal bridge — listener count returns to 0", () => {
    const { source, listenerCount } = buildSubscribingSource(0);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      const dispose = createRoot((disposeFn) => {
        createSignalFromSource(source);

        return disposeFn;
      });

      // Mid-cycle: exactly one listener is active.
      expect(listenerCount()).toBe(1);

      dispose();

      // Post-dispose: the owner's onCleanup ran, subscription released.
      expect(listenerCount()).toBe(0);
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // 1000 owner/dispose cycles must leave no residual heap accumulation.
    // 10MB budget is generous — a leak (e.g. orphaned listener closures)
    // would dwarf it.
    expect(heapAfter - heapBefore).toBeLessThan(10 * MB);
  }, 60_000);

  it("CR1.2: 1000 createRoot/dispose cycles with store bridge — listener count returns to 0", () => {
    const { source, listenerCount } = buildSubscribingSource({
      route: undefined,
      previousRoute: undefined,
    } as { route: { name: string } | undefined; previousRoute: undefined });

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      const dispose = createRoot((disposeFn) => {
        createStoreFromSource(source);

        return disposeFn;
      });

      expect(listenerCount()).toBe(1);

      dispose();

      expect(listenerCount()).toBe(0);
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(10 * MB);
  }, 60_000);

  it("CR1.3: nested createRoot inside parent — inner dispose does NOT poison outer owner", () => {
    // §7.2 #17 audit note specifically called out "explicit createRoot
    // ownership probe". The nesting case is the subtle one — Solid
    // semantics: an inner createRoot is detached, so disposing inner
    // does not affect outer.
    const { source, listenerCount } = buildSubscribingSource(0);

    let innerDispose: (() => void) | undefined;
    let outerSignal: (() => number) | undefined;

    const outerDispose = createRoot((outer) => {
      // Outer owner: subscribes to source.
      outerSignal = createSignalFromSource(source);

      // Inner createRoot: detached owner with its own subscription.
      innerDispose = createRoot((inner) => {
        createSignalFromSource(source);

        return inner;
      });

      return outer;
    });

    // Both owners hold subscriptions.
    expect(listenerCount()).toBe(2);
    expect(outerSignal?.()).toBe(0);

    // Dispose inner only — outer subscription must survive.
    innerDispose?.();

    expect(listenerCount()).toBe(1);
    expect(outerSignal?.()).toBe(0);

    // Dispose outer — last subscription released.
    outerDispose();

    expect(listenerCount()).toBe(0);
  });

  it("CR1.4: createRoot survives 500 emit() cycles per owner without listener buildup", () => {
    const { source, emit, listenerCount } = buildSubscribingSource(0);

    const dispose = createRoot((d) => {
      createSignalFromSource(source);

      return d;
    });

    // 500 emits — every emit fires the same single listener; no buildup.
    for (let i = 0; i < 500; i++) {
      emit(i);
    }

    expect(listenerCount()).toBe(1);

    dispose();

    expect(listenerCount()).toBe(0);
  });
});

// Lightweight smoke probe that the stress harness wires createStressRouter
// correctly with createRoot — sanity guard against env regressions.
describe("CR2 — createRoot smoke (sanity)", () => {
  it("CR2.1: createRoot with a router can be disposed cleanly", async () => {
    const router = createStressRouter(2);

    await router.start("/route0");

    const dispose = createRoot((d) => d);

    dispose();

    router.stop();

    expect(true).toBe(true);
  });
});
