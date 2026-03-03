import { describe, it, expect, vi } from "vitest";

import { createBaseStore } from "../../src/createBaseStore.js";

describe("createBaseStore", () => {
  it("subscribe: adds listener, returned fn removes it", () => {
    const store = createBaseStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store._update(1);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store._update(2);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("getSnapshot: returns initialSnapshot", () => {
    const initial = { value: 42 };
    const store = createBaseStore(initial);

    expect(store.getSnapshot()).toBe(initial);
  });

  it("_update: updates snapshot, notifies all listeners synchronously", () => {
    const store = createBaseStore(0);
    const listener = vi.fn();

    store.subscribe(listener);

    store._update(99);

    expect(store.getSnapshot()).toBe(99);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("_update: multiple listeners all notified", () => {
    const store = createBaseStore(0);
    const l1 = vi.fn();
    const l2 = vi.fn();
    const l3 = vi.fn();

    store.subscribe(l1);
    store.subscribe(l2);
    store.subscribe(l3);

    store._update(1);

    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
    expect(l3).toHaveBeenCalledTimes(1);
  });

  it("each subscriber can independently unsubscribe", () => {
    const store = createBaseStore(0);
    const l1 = vi.fn();
    const l2 = vi.fn();
    const unsub1 = store.subscribe(l1);

    store.subscribe(l2);

    unsub1();
    store._update(1);

    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it("destroy: sets destroyed, clears listeners (no more notifications)", () => {
    const store = createBaseStore(0);
    const listener = vi.fn();

    store.subscribe(listener);

    store.destroy();
    store._update(1);

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: idempotent (second call is no-op, does not throw)", () => {
    const store = createBaseStore(0);

    store.destroy();

    expect(() => {
      store.destroy();
    }).not.toThrowError();
  });

  it("post-destroy: getSnapshot still returns last value", () => {
    const store = createBaseStore(0);

    store._update(42);
    store.destroy();

    expect(store.getSnapshot()).toBe(42);
  });

  it("post-destroy: subscribe returns no-op unsubscribe", () => {
    const store = createBaseStore(0);

    store.destroy();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store._update(1); // _update is no-op after destroy, but listener should not be added

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrowError();
  });

  it("post-destroy: _update is no-op (snapshot NOT updated, no errors)", () => {
    const store = createBaseStore(0);

    store.destroy();

    expect(() => {
      store._update(99);
    }).not.toThrowError();
    expect(store.getSnapshot()).toBe(0);
  });
});
