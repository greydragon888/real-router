import { renderHook } from "@solidjs/testing-library";
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
});
