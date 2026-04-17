import { describe, it, expect, vi } from "vitest";

import { createReactiveSource } from "../../src/createReactiveSource.svelte";

import type { RouterSource } from "@real-router/sources";

describe("createReactiveSource", () => {
  it("should return .current equal to source.getSnapshot()", () => {
    const snapshot = { value: 42 };
    const source: RouterSource<typeof snapshot> = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      destroy: () => {},
    };

    const reactive = createReactiveSource(source);

    expect(reactive.current).toBe(snapshot);
  });

  // Documents the propagation contract of createReactiveSource:
  // it is a thin bridge to createSubscriber and does NOT swallow exceptions
  // thrown by source.getSnapshot(). The error surfaces at the call site that
  // reads .current (template, $derived, or user code). Consumers that need
  // a safety net must catch on their side or guarantee that the underlying
  // source cannot throw.
  it("should propagate errors thrown by source.getSnapshot()", () => {
    const error = new Error("snapshot failure");
    const source: RouterSource<never> = {
      subscribe: () => () => {},
      getSnapshot: () => {
        throw error;
      },
      destroy: () => {},
    };

    const reactive = createReactiveSource(source);

    expect(() => reactive.current).toThrow(error);
  });

  // Locks in the "lazy" contract from CLAUDE.md gotcha #3:
  // createSubscriber does NOT invoke source.subscribe() when .current is read
  // outside of a reactive context. Only getSnapshot() runs.
  it("should not call source.subscribe() when .current is read outside reactive context", () => {
    const subscribeSpy = vi.fn(() => () => {});
    const source: RouterSource<number> = {
      subscribe: subscribeSpy,
      getSnapshot: () => 0,
      destroy: () => {},
    };

    const reactive = createReactiveSource(source);

    expect(reactive.current).toBe(0);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });
});
