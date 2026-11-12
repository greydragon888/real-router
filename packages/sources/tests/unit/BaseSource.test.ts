import { describe, it, expect, vi } from "vitest";

import { BaseSource } from "../../src/BaseSource";
import { captureAsyncRethrows } from "../helpers";

describe("BaseSource — subscribe order", () => {
  it("first listener is added BEFORE onFirstSubscribe runs", () => {
    let listenerInsideOnFirstSubscribeWasNotified = false;

    const source = new BaseSource<number>(0, {
      onFirstSubscribe: () => {
        // Synchronously emit a snapshot update from inside onFirstSubscribe.
        // The listener added by the very subscribe() call that triggered this
        // hook MUST receive the notification — otherwise reconcile-on-mount
        // patterns (e.g. Preact RouteView nested remount) miss the
        // post-reconnect snapshot.
        source.updateSnapshot(42);
      },
    });

    source.subscribe(() => {
      listenerInsideOnFirstSubscribeWasNotified = true;
    });

    expect(listenerInsideOnFirstSubscribeWasNotified).toBe(true);
    expect(source.getSnapshot()).toBe(42);
  });

  it("only the first subscribe triggers onFirstSubscribe", () => {
    const onFirstSubscribe = vi.fn();
    const source = new BaseSource<number>(0, { onFirstSubscribe });
    const unsub1 = source.subscribe(() => {});
    const unsub2 = source.subscribe(() => {});

    expect(onFirstSubscribe).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it("re-subscribing after full unsubscribe triggers onFirstSubscribe again", () => {
    const onFirstSubscribe = vi.fn();
    const source = new BaseSource<number>(0, { onFirstSubscribe });
    const unsub1 = source.subscribe(() => {});

    unsub1();

    const unsub2 = source.subscribe(() => {});

    expect(onFirstSubscribe).toHaveBeenCalledTimes(2);

    unsub2();
  });

  it("onLastUnsubscribe fires only when listener count reaches zero", () => {
    const onLastUnsubscribe = vi.fn();
    const source = new BaseSource<number>(0, { onLastUnsubscribe });
    const unsub1 = source.subscribe(() => {});
    const unsub2 = source.subscribe(() => {});

    unsub1();

    expect(onLastUnsubscribe).not.toHaveBeenCalled();

    unsub2();

    expect(onLastUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("subscribe() returns a no-op unsubscribe after destroy() and listener is never called", () => {
    const source = new BaseSource<number>(0);

    source.destroy();

    const listener = vi.fn();
    const unsub = source.subscribe(listener);

    expect(typeof unsub).toBe("function");
    expect(() => {
      unsub();
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("an unsubscribe called after destroy() runs no onLastUnsubscribe", () => {
    const onLastUnsubscribe = vi.fn();
    const source = new BaseSource<number>(0, { onLastUnsubscribe });
    const unsubscribe = source.subscribe(() => {});

    source.destroy();
    unsubscribe();

    expect(onLastUnsubscribe).not.toHaveBeenCalled();
  });

  it("destroy() invokes onDestroy exactly once", () => {
    const onDestroy = vi.fn();
    const source = new BaseSource<number>(0, { onDestroy });

    source.destroy();
    source.destroy();
    source.destroy();

    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it("getSnapshot() returns the latest snapshot after updateSnapshot()", () => {
    const source = new BaseSource<number>(0);

    expect(source.getSnapshot()).toBe(0);

    source.updateSnapshot(1);

    expect(source.getSnapshot()).toBe(1);

    source.updateSnapshot(2);

    expect(source.getSnapshot()).toBe(2);
  });

  it("updateSnapshot() notifies all subscribed listeners", () => {
    const source = new BaseSource<number>(0);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    source.subscribe(listener1);
    source.subscribe(listener2);
    source.updateSnapshot(7);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it("isolates listener exceptions — surviving listeners still notified, error rethrown asynchronously", async () => {
    const source = new BaseSource<number>(0);
    const survivor = vi.fn();
    const thrown = new Error("boom");

    // Observe the re-throw at the schedule, not at the process-level event —
    // see the doc-block on `captureAsyncRethrows`.
    const rethrown = captureAsyncRethrows();

    try {
      source.subscribe(() => {
        throw thrown;
      });
      source.subscribe(survivor);

      expect(() => {
        source.updateSnapshot(1);
      }).not.toThrow();

      // Surviving listener still receives the notification even though the
      // first listener threw — invariant "after updateSnapshot all listeners
      // see the new snapshot" holds.
      expect(survivor).toHaveBeenCalledTimes(1);
      expect(source.getSnapshot()).toBe(1);

      await rethrown.flush();

      // Exactly one schedule, carrying the original error.
      expect(rethrown.scheduled()).toBe(1);
      expect(rethrown.errors).toStrictEqual([thrown]);
    } finally {
      rethrown.restore();
    }
  });

  it("double-unsubscribe deletes the listener idempotently (other listeners unaffected)", () => {
    const source = new BaseSource<number>(0);
    const survivor = vi.fn();
    const dropped = vi.fn();

    source.subscribe(survivor);
    const unsubDropped = source.subscribe(dropped);

    unsubDropped();
    unsubDropped();

    source.updateSnapshot(1);

    // Surviving listener still receives notifications; the doubly-unsubscribed
    // listener never does. (Note: consumers must keep `onLastUnsubscribe`
    // idempotent — BaseSource's unsubscribe function does not track per-call
    // state, and re-firing when listeners are empty is by design.)
    expect(survivor).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });
});

describe("BaseSource — reconcile (#2909)", () => {
  it("a read with no listener returns reconcile(stored) and stores it", () => {
    const reconcile = vi.fn((current: number) => current + 1);
    const source = new BaseSource<number>(0, { reconcile });

    expect(source.getSnapshot()).toBe(1);
    expect(source.getSnapshot()).toBe(2);
    expect(reconcile.mock.calls).toStrictEqual([[0], [1]]);
  });

  it("a read while a listener is registered does not reconcile", () => {
    const reconcile = vi.fn((current: number) => current);
    const source = new BaseSource<number>(0, { reconcile });

    source.subscribe(() => {});
    reconcile.mockClear();

    expect(source.getSnapshot()).toBe(0);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("a read after destroy() returns the stored snapshot without reconciling", () => {
    const reconcile = vi.fn(() => 1);
    const source = new BaseSource<number>(0, { reconcile });

    source.destroy();

    expect(source.getSnapshot()).toBe(0);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("the first subscribe connects, then reconciles and notifies its listener", () => {
    const order: string[] = [];
    const source = new BaseSource<number>(0, {
      reconcile: () => {
        order.push("reconcile");

        return 1;
      },
      onFirstSubscribe: () => {
        order.push("onFirstSubscribe");
      },
    });

    source.subscribe(() => {
      order.push(`listener ${String(source.getSnapshot())}`);
    });

    expect(order).toStrictEqual([
      "onFirstSubscribe",
      "reconcile",
      "listener 1",
    ]);
  });

  it("the first subscribe notifies nobody when reconcile returns the stored snapshot", () => {
    const listener = vi.fn();
    const source = new BaseSource<number>(0, {
      reconcile: (current) => current,
    });

    source.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
  });

  it("compares the reconciled snapshot with Object.is, as useSyncExternalStore does", () => {
    const listener = vi.fn();
    const source = new BaseSource<number>(Number.NaN, {
      reconcile: () => Number.NaN,
    });

    source.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
  });

  it("only the first subscribe reconciles", () => {
    const reconcile = vi.fn((current: number) => current);
    const source = new BaseSource<number>(0, { reconcile });

    source.subscribe(() => {});
    source.subscribe(() => {});

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("a connect that throws takes its listener back, so the next subscribe connects again", () => {
    const refusal = new Error("refused");
    const onFirstSubscribe = vi.fn((): void => {
      throw refusal;
    });
    const reconcile = vi.fn((current: number) => current);
    const source = new BaseSource<number>(0, { reconcile, onFirstSubscribe });

    expect(() => source.subscribe(() => {})).toThrow(refusal);

    source.getSnapshot();

    expect(reconcile).toHaveBeenCalledTimes(1);

    onFirstSubscribe.mockImplementation(() => {});
    source.subscribe(() => {});

    expect(onFirstSubscribe).toHaveBeenCalledTimes(2);
  });

  it("a catch-up that throws takes its listener back and disconnects, so the next subscribe connects again", () => {
    const refusal = new Error("refused");
    const reconcile = vi.fn<(current: number) => number>(() => {
      throw refusal;
    });
    const onFirstSubscribe = vi.fn();
    const onLastUnsubscribe = vi.fn();
    const source = new BaseSource<number>(0, {
      reconcile,
      onFirstSubscribe,
      onLastUnsubscribe,
    });

    expect(() => source.subscribe(() => {})).toThrow(refusal);
    expect(onFirstSubscribe).toHaveBeenCalledTimes(1);
    expect(onLastUnsubscribe).toHaveBeenCalledTimes(1);

    reconcile.mockImplementation((current) => current);
    source.subscribe(() => {});

    expect(onFirstSubscribe).toHaveBeenCalledTimes(2);
  });
});
