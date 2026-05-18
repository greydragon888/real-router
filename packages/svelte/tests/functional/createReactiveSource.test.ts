import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, it, expect, vi } from "vitest";

import { createReactiveSource } from "../../src/createReactiveSource.svelte";
import ReactiveSourceEffectReader from "../helpers/ReactiveSourceEffectReader.svelte";

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
  // outside of a reactive context. Only getSnapshot() runs — and it MUST run,
  // otherwise the read would return a stale/cached value and break Inv3
  // (snapshot transitions observable).
  it("should not call source.subscribe() when .current is read outside reactive context", () => {
    const subscribeSpy = vi.fn(() => () => {});
    const getSnapshotSpy = vi.fn(() => 0);
    const source: RouterSource<number> = {
      subscribe: subscribeSpy,
      getSnapshot: getSnapshotSpy,
      destroy: () => {},
    };

    const reactive = createReactiveSource(source);

    expect(reactive.current).toBe(0);
    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(getSnapshotSpy).toHaveBeenCalledTimes(1);
  });

  // Closes review §5.9 row 4: the dual of the lazy contract — when `.current`
  // IS read inside a reactive context (here `$effect`), createSubscriber
  // invokes `source.subscribe` once so the underlying source can push
  // updates into the effect's dependency graph.
  it("should call source.subscribe() exactly once when .current is read inside $effect", () => {
    const subscribeSpy = vi.fn(() => () => undefined);
    const source: RouterSource<number> = {
      subscribe: subscribeSpy,
      getSnapshot: () => 42,
      destroy: () => undefined,
    };
    const reads: unknown[] = [];

    render(ReactiveSourceEffectReader, {
      props: {
        source,
        onRead: (values: unknown[]) => {
          reads.push(...values);
        },
      },
    });

    flushSync();

    expect(reads).toStrictEqual([42]);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  // Closes review §5.9 row 8: multiple `.current` reads inside the SAME
  // reactive frame must result in a SINGLE underlying subscribe call. This
  // is a property of Svelte 5's createSubscriber — without dedup, components
  // that read `.current` many times in a single render would pile up N
  // subscriptions and N teardowns per effect cycle.
  it("multiple .current reads in the same $effect → single subscribe call", () => {
    const subscribeSpy = vi.fn(() => () => undefined);
    const source: RouterSource<number> = {
      subscribe: subscribeSpy,
      getSnapshot: () => 7,
      destroy: () => undefined,
    };
    const reads: unknown[] = [];

    render(ReactiveSourceEffectReader, {
      props: {
        source,
        readCount: 5,
        onRead: (values: unknown[]) => {
          reads.push(...values);
        },
      },
    });

    flushSync();

    expect(reads).toStrictEqual([7, 7, 7, 7, 7]);
    // Five reads in one effect frame → still ONE subscribe.
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  // Closes review §5.9 row 5: the cleanup function returned by
  // `source.subscribe(...)` MUST be invoked on effect teardown (i.e. when the
  // owning component unmounts). Stress tests verify heap stability across
  // mass mount/unmount; this is an explicit unit test that pins the
  // single-cleanup contract.
  it("subscribe cleanup is invoked on component unmount", () => {
    const cleanupSpy = vi.fn();
    const source: RouterSource<number> = {
      subscribe: () => cleanupSpy,
      getSnapshot: () => 0,
      destroy: () => undefined,
    };

    const { unmount } = render(ReactiveSourceEffectReader, {
      props: {
        source,
        onRead: () => undefined,
      },
    });

    flushSync();

    // Cleanup not called yet — component still mounted.
    expect(cleanupSpy).not.toHaveBeenCalled();

    unmount();

    // Now the effect has torn down → cleanup fires exactly once.
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  // Closes review §5.9 row 7 (explicit version): if the underlying source
  // mutates its snapshot between reads (outside a reactive frame), subsequent
  // `.current` reads observe the new value. The function calls
  // `source.getSnapshot()` fresh on every read — no internal caching.
  it("repeated .current reads return the actual snapshot after source mutation", () => {
    let value = 1;
    const source: RouterSource<number> = {
      subscribe: () => () => undefined,
      getSnapshot: () => value,
      destroy: () => undefined,
    };

    const reactive = createReactiveSource(source);

    expect(reactive.current).toBe(1);

    value = 2;

    expect(reactive.current).toBe(2);

    value = 3;

    expect(reactive.current).toBe(3);
  });
});
