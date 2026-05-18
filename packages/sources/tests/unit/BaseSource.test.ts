import { describe, it, expect, vi } from "vitest";

import { BaseSource } from "../../src/BaseSource";

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

    // Capture the asynchronously re-thrown error before vitest's default
    // uncaughtException handler fails the test.
    const rethrown: unknown[] = [];
    const previousListeners = [...process.listeners("uncaughtException")];

    process.removeAllListeners("uncaughtException");
    const captureHandler = (error: unknown): void => {
      rethrown.push(error);
    };

    process.on("uncaughtException", captureHandler);

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

      // Drain the microtask queue so the queueMicrotask(throw) lands.
      await Promise.resolve();
      await Promise.resolve();

      expect(rethrown).toStrictEqual([thrown]);
    } finally {
      process.removeListener("uncaughtException", captureHandler);
      for (const listener of previousListeners) {
        process.on("uncaughtException", listener);
      }
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
