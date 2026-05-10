import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect } from "vitest";

import { sourceToSignal } from "../../src/sourceToSignal";

import type { RouterSource } from "@real-router/sources";

/**
 * Stress: a `RouterSource<T>` that begins throwing in `getSnapshot()` after
 * the host component is destroyed. The 2026-04-17 review flagged this as
 * unspecified behavior — does the cached signal value stay readable, or
 * does a stale subscription fire and crash on the next emit?
 *
 * Expected: `destroyRef.onDestroy` already calls `unsubscribe()` + `source.destroy()`
 * inside `sourceToSignal`, so the signal must hold the last good value, and
 * post-destroy `getSnapshot()` calls inside the source itself must not be
 * triggered by the bridge (no listener remains).
 */
function createThrowAfterDestroySource<T>(initial: T): RouterSource<T> & {
  emit: (value: T) => void;
  triggerThrow: () => void;
  getSnapshotCallCount: () => number;
} {
  let current = initial;
  let listener: (() => void) | null = null;
  let shouldThrow = false;
  let snapshotCalls = 0;

  return {
    getSnapshot: () => {
      snapshotCalls++;

      if (shouldThrow) {
        throw new Error("source disposed — getSnapshot must not be called");
      }

      return current;
    },
    subscribe: (fn: () => void) => {
      listener = fn;

      return () => {
        listener = null;
      };
    },
    destroy: () => {
      // marks the source as torn down — any subsequent getSnapshot must throw
      shouldThrow = true;
    },
    emit: (value: T) => {
      current = value;
      listener?.();
    },
    triggerThrow: () => {
      shouldThrow = true;
    },
    getSnapshotCallCount: () => snapshotCalls,
  } as RouterSource<T> & {
    emit: (value: T) => void;
    triggerThrow: () => void;
    getSnapshotCallCount: () => number;
  };
}

describe("sourceToSignal — source throws in getSnapshot after destroy", () => {
  it("post-destroy emits do not invoke listener — signal retains last good value", () => {
    const source = createThrowAfterDestroySource(0);

    @Component({ template: "" })
    class Host {
      readonly sig = sourceToSignal(source);
    }

    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);

    expect(fixture.componentInstance.sig()).toBe(0);

    source.emit(1);

    expect(fixture.componentInstance.sig()).toBe(1);

    fixture.destroy();

    // Source.destroy() flips shouldThrow=true. Any future emit() that reaches
    // the listener would call getSnapshot() and throw. The bridge MUST have
    // unsubscribed in onDestroy, so this emit must be a no-op.
    expect(() => {
      source.emit(99);
    }).not.toThrow();
    expect(fixture.componentInstance.sig()).toBe(1);
  });

  it("source flipped to throwing externally — bridge no longer reads after destroy", () => {
    const source = createThrowAfterDestroySource("a");

    @Component({ template: "" })
    class Host {
      readonly sig = sourceToSignal(source);
    }

    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);

    expect(fixture.componentInstance.sig()).toBe("a");

    fixture.destroy();

    source.triggerThrow();

    // Calling emit triggers nothing because the listener was unsubscribed.
    // The signal remains readable with the cached value.
    expect(() => {
      source.emit("z");
    }).not.toThrow();
    expect(fixture.componentInstance.sig()).toBe("a");
  });

  it("100 rapid emit→destroy cycles — no leaked subscription invokes throwing snapshot", () => {
    for (let cycle = 0; cycle < 100; cycle++) {
      const source = createThrowAfterDestroySource(cycle);

      @Component({ template: "" })
      class Host {
        readonly sig = sourceToSignal(source);
      }

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [Host] });
      const fixture = TestBed.createComponent(Host);

      source.emit(cycle * 2);
      fixture.destroy();

      expect(() => {
        source.emit(cycle * 3);
      }).not.toThrow();
    }
  }, 30_000);
});
