import { renderHook } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { describe, it, expect, vi } from "vitest";

import { createSignalFromSource } from "@real-router/solid";

import type { RouterSource } from "@real-router/sources";

function createMockSource<T>(initial: T): {
  source: RouterSource<T>;
  emit: (value: T) => void;
  destroySpy: ReturnType<typeof vi.fn>;
} {
  let current = initial;
  let listener: (() => void) | null = null;
  const destroySpy = vi.fn();

  const source: RouterSource<T> = {
    subscribe: (cb) => {
      listener = cb;

      return () => {
        listener = null;
      };
    },
    getSnapshot: () => current,
    destroy: destroySpy,
  };

  return {
    source,
    emit: (value: T) => {
      current = value;
      listener?.();
    },
    destroySpy,
  };
}

describe("createSignalFromSource", () => {
  it("should return initial snapshot value", () => {
    const { source } = createMockSource(42);

    const { result } = renderHook(() => createSignalFromSource(source));

    expect(result()).toBe(42);
  });

  it("should update when source emits", () => {
    const { source, emit } = createMockSource("hello");

    const { result } = renderHook(() => createSignalFromSource(source));

    expect(result()).toBe("hello");

    emit("world");

    expect(result()).toBe("world");
  });

  it("should unsubscribe on cleanup", () => {
    const { source, emit } = createMockSource(0);
    const subscribeSpy = vi.spyOn(source, "subscribe");

    const { result, cleanup } = renderHook(() =>
      createSignalFromSource(source),
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(result()).toBe(0);

    cleanup();

    emit(999);

    expect(result()).toBe(0);
  });

  it("should handle object values", () => {
    const initial = { route: "home", params: {} };
    const { source, emit } = createMockSource(initial);

    const { result } = renderHook(() => createSignalFromSource(source));

    expect(result()).toStrictEqual(initial);

    const next = { route: "users", params: { id: "1" } };

    emit(next);

    expect(result()).toStrictEqual(next);
  });

  it("should handle multiple rapid updates", () => {
    const { source, emit } = createMockSource(0);

    const { result } = renderHook(() => createSignalFromSource(source));

    for (let i = 1; i <= 100; i++) {
      emit(i);
    }

    expect(result()).toBe(100);
  });

  it("should handle boolean values", () => {
    const { source, emit } = createMockSource(false);

    const { result } = renderHook(() => createSignalFromSource(source));

    expect(result()).toBe(false);

    emit(true);

    expect(result()).toBe(true);

    emit(false);

    expect(result()).toBe(false);
  });

  it("should work after subscribe/unsubscribe/subscribe cycle", () => {
    const { source, emit } = createMockSource(0);
    const subscribeSpy = vi.spyOn(source, "subscribe");

    // First subscription
    const { result: result1, cleanup: cleanup1 } = renderHook(() =>
      createSignalFromSource(source),
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(result1()).toBe(0);

    emit(1);

    expect(result1()).toBe(1);

    // Unsubscribe
    cleanup1();

    emit(2);

    // Old subscription no longer receives updates
    expect(result1()).toBe(1);

    // Second subscription — should work independently
    const { result: result2 } = renderHook(() =>
      createSignalFromSource(source),
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(2);

    // Should read current snapshot (2)
    expect(result2()).toBe(2);

    emit(3);

    // Second subscription receives updates
    expect(result2()).toBe(3);
  });

  // Documents gotcha #6 "createSignalFromSource Ownership" from
  // packages/solid/CLAUDE.md:
  //   createSignalFromSource calls onCleanup — it must be called inside a
  //   reactive owner (component, createRoot, etc.). Don't call it at module
  //   level.
  // Without an owner, Solid's onCleanup logs a dev-mode warning because there
  // is no scope that can dispose the subscription.
  it("warns when called outside reactive owner — uses onCleanup", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { source } = createMockSource(0);

    createSignalFromSource(source);

    // Pin down the exact signal — this is Solid's onCleanup ownership warning.
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("cleanups created outside a `createRoot`"),
    );

    consoleWarn.mockRestore();
  });

  // Complements gotcha #6: the createRoot owner correctly disposes the
  // subscription when dispose() is called, preventing leaks.
  it("disposes subscription when createRoot owner is disposed", () => {
    const { source, emit } = createMockSource(0);
    const subscribeSpy = vi.spyOn(source, "subscribe");

    let readValue: (() => number) | undefined;

    const dispose = createRoot((disposeFn) => {
      readValue = createSignalFromSource(source);

      return disposeFn;
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(readValue?.()).toBe(0);

    emit(1);

    expect(readValue?.()).toBe(1);

    dispose();

    emit(42);

    // After dispose, the signal no longer receives updates — listener removed.
    expect(readValue?.()).toBe(1);
  });
});
