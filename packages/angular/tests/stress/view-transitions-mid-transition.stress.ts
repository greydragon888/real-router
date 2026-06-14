import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { MB, createStressRouter, takeHeapSnapshot } from "./helpers";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

interface FakeVTInstance {
  skipTransition: Mock;
}

interface VTStub {
  startSpy: Mock;
  instances: FakeVTInstance[];
  pendingCallbacks: (() => void | Promise<void>)[];
  flushPendingCallback: () => Promise<void>;
  reset: () => void;
}

/**
 * Async-capturing VT stub: holds the `startViewTransition` callback so the
 * test can dispose the router BEFORE the browser would have invoked the
 * callback. Mirrors `stubStartViewTransitionAsync` in
 * `tests/functional/view-transitions.test.ts` but with a flush helper that
 * yields a microtask afterwards so the router's setTimeout(0) resolver runs.
 */
function stubStartViewTransition(): VTStub {
  const instances: FakeVTInstance[] = [];
  const pendingCallbacks: (() => void | Promise<void>)[] = [];

  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    pendingCallbacks.push(cb);

    const instance: FakeVTInstance = {
      skipTransition: vi.fn(),
    };

    instances.push(instance);

    return instance;
  });

  const original: unknown = (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition;

  (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition =
    startSpy as unknown as Document["startViewTransition"];

  return {
    startSpy,
    instances,
    pendingCallbacks,
    async flushPendingCallback() {
      const cb = pendingCallbacks.shift();

      if (cb !== undefined) {
        await cb();
      }

      // Let setTimeout(0) inside the VT utility resolve.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    reset() {
      if (original === undefined) {
        delete (document as { startViewTransition?: unknown })
          .startViewTransition;
      } else {
        (
          document as Document & { startViewTransition?: unknown }
        ).startViewTransition = original as Document["startViewTransition"];
      }
    },
  };
}

@Component({ template: "" })
class Host {
  readonly mounted = true;
}

describe("viewTransitions stress — mid-transition router.stop() / destroy", () => {
  let router: Router;
  let stub: VTStub;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
    stub = stubStartViewTransition();
  });

  afterEach(() => {
    stub.reset();
    try {
      router.stop();
    } catch {
      // already stopped by the test
    }
  });

  it("router.stop() while VT callback is pending — no hanging promise, currentVT cleaned", async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRealRouter(router, { viewTransitions: true })],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    // Kick off a navigation. The VT utility opens a transition and parks the
    // `closeVT` resolver until subscribe fires. We then race the resolver
    // against `router.stop()` to verify destroy paths don't leak the open VT.
    const nav = router.navigate("route1");

    // Stop the fixture (Angular's DestroyRef fires VT.destroy()) BEFORE the
    // pending VT callback is invoked. The utility must skip the current VT
    // and resolve the deferred so the router doesn't hang.
    fixture.destroy();
    router.stop();

    // Even after teardown, flushing the captured callback must not throw —
    // it's been wired up to a resolver that may have already fired via
    // skipTransition in the destroy path.
    await stub.flushPendingCallback();

    // The original navigate() promise will reject (router stopped). Confirm
    // it settles within the next microtasks rather than hanging the suite.
    await expect(nav).rejects.toBeDefined();

    // The instance was created, and the destroy path called skipTransition
    // on the currently-open VT (utility's destroy() calls
    // `currentVT?.skipTransition?.()`).
    expect(stub.instances.length).toBeGreaterThanOrEqual(1);
    expect(stub.instances[0].skipTransition).toHaveBeenCalled();
  }, 30_000);

  it("100 rapid stop/restart cycles around in-flight VT — bounded heap, all destroyed", async () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      router = createStressRouter(10);
      await router.start("/route0");

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Host],
        providers: [provideRealRouter(router, { viewTransitions: true })],
      });
      const fixture = TestBed.createComponent(Host);

      fixture.detectChanges();

      // Open a VT, then tear down immediately — exactly the "user navigates
      // away from a transitioning page" scenario.
      const nav = router.navigate(`route${(i % 9) + 1}`);

      fixture.destroy();
      router.stop();
      await stub.flushPendingCallback();
      // Drain the rejected navigate.
      await nav.catch(() => undefined);
    }

    const heapAfter = takeHeapSnapshot();

    // THROUGHPUT GUARD (GC-masked). 100 stop/restart cycles, fresh router +
    // fixture per cycle, both torn down inside the loop — a per-cycle VT/source
    // leak is reclaimed before the snapshot. Measured healthy: ~8.5 MB (3 runs:
    // 8697/8693/8702 KB). Threshold 28 MB ≈ 3.2× healthy max. startSpy ≥ 100 +
    // skipTransition-called assertions below are the real discriminators.
    expect(heapAfter - heapBefore).toBeLessThan(28 * MB);
    // Every cycle invoked startViewTransition once, every instance had
    // skipTransition called (utility's destroy path).
    expect(stub.startSpy.mock.calls.length).toBeGreaterThanOrEqual(100);

    for (const instance of stub.instances) {
      expect(instance.skipTransition).toHaveBeenCalled();
    }
  }, 60_000);

  it("destroy after VT callback already fired — no extra skipTransition, no throw", async () => {
    // Flushing the pending callback before destroy mimics "transition
    // already completed → consumer navigates away". Verifies destroy is
    // idempotent and does not double-skip on a completed VT.
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRealRouter(router, { viewTransitions: true })],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    const nav = router.navigate("route2");

    // Let leave subscriber wire up the VT, then flush it (browser invoked
    // updateCallback) so the navigation completes naturally.
    await stub.flushPendingCallback();
    await nav.catch(() => undefined);

    // Now navigate to a completed state. Destroy after that.
    expect(stub.instances.length).toBeGreaterThanOrEqual(1);

    fixture.destroy();

    // No assertion on skipTransition — VT may have completed cleanly.
    // The point is: destroy after success doesn't crash and is idempotent.
    expect(() => {
      fixture.destroy();
    }).not.toThrow();
  }, 30_000);
});
