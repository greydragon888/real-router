import { describe, it, expect, vi } from "vitest";
import { effectScope } from "vue";

import { setupRouteProvision } from "../../src/setupRouteProvision";
import { useRefFromSource } from "../../src/useRefFromSource";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { RouterSource } from "@real-router/sources";

// Review §5.10 — direct tests for the two private Vue helpers that wire the
// `@real-router/sources` observables into Vue's reactivity system. The
// existing integration tests (useRouteNode.test.ts and RouterProvider.*.ts)
// cover the happy path through component scope; this file pins the
// edge cases that those tests cannot easily reach.

/** Hand-rolled source so we can drive subscribe/destroy behaviour directly. */
function makeFakeSource<T>(initial: T): {
  source: RouterSource<T>;
  /** Number of times subscribe() was called. */
  subscribeCount: number;
  /** Number of times the unsubscribe returned by subscribe() was invoked. */
  unsubscribeCount: number;
  /** Manually advance the snapshot and notify all subscribers. */
  push: (next: T) => void;
  /** Read internal subscriber count. */
  listenerCount: () => number;
} {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const state = { subscribeCount: 0, unsubscribeCount: 0 };

  const source = {
    subscribe(listener: () => void) {
      state.subscribeCount++;
      listeners.add(listener);

      return () => {
        state.unsubscribeCount++;
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    destroy() {
      listeners.clear();
    },
  } as RouterSource<T>;

  return {
    source,
    get subscribeCount() {
      return state.subscribeCount;
    },
    get unsubscribeCount() {
      return state.unsubscribeCount;
    },
    push(next: T) {
      snapshot = next;
      listeners.forEach((l) => {
        l();
      });
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

describe("useRefFromSource — gotchas and edge cases", () => {
  it("inside an explicit effectScope — onScopeDispose runs and unsubscribes from the source", () => {
    // Happy-path control: useRefFromSource MUST tie its subscription to the
    // active reactive scope. Wrapping the call in an effectScope and stopping
    // it should fire onScopeDispose → invoke the unsubscribe returned by
    // source.subscribe().
    const fake = makeFakeSource({ value: "initial" });
    const scope = effectScope();

    let ref: ReturnType<typeof useRefFromSource> | undefined;

    scope.run(() => {
      ref = useRefFromSource(fake.source);
    });

    expect(fake.subscribeCount).toBe(1);
    expect(fake.unsubscribeCount).toBe(0);

    // Push a new snapshot — the ref must update inside the scope.
    fake.push({ value: "updated" });

    expect(ref?.value).toStrictEqual({ value: "updated" });

    scope.stop();

    expect(fake.unsubscribeCount).toBe(1);
    expect(fake.listenerCount()).toBe(0);

    // After scope teardown, further pushes do not reach the ref. Vue does not
    // throw inside the listener — the unsubscribe already removed it.
    fake.push({ value: "after-dispose" });

    expect(ref?.value).toStrictEqual({ value: "updated" });
  });

  it("at module level (no effectScope) — onScopeDispose is a silent no-op → subscription LEAKS", () => {
    // Documented gotcha: calling useRefFromSource outside any reactive scope
    // (e.g. at module top level) means Vue's onScopeDispose has nowhere to
    // register the unsubscribe callback. The ref still works, but the
    // router subscription cannot be released — a memory leak by design.
    //
    // We lock the silent-leak behaviour as a regression: this is the exact
    // pattern that CLAUDE.md warns against. A future refactor that adds a
    // safety-net throw (or a console.warn) would break this expectation and
    // require the gotcha to be updated.
    const fake = makeFakeSource({ value: "initial" });

    // No `effectScope()` wrapper — direct module-level call.
    const ref = useRefFromSource(fake.source);

    expect(ref.value).toStrictEqual({ value: "initial" });
    // Subscription is alive — count went up.
    expect(fake.subscribeCount).toBe(1);

    // Push a new value. The ref does update (subscribe wiring is intact).
    fake.push({ value: "after-push" });

    expect(ref.value).toStrictEqual({ value: "after-push" });

    // BUT the listener is still attached — there is no scope to dispose, so
    // the unsubscribe path was registered against a no-op. Without manual
    // cleanup we have a leaked subscription.
    expect(fake.unsubscribeCount).toBe(0);
    expect(fake.listenerCount()).toBe(1);

    // Manual cleanup so the test does not actually leak. In production, this
    // is the workaround a consumer needs if they really must call the
    // composable at module level.
    fake.source.destroy();
  });

  it("source.subscribe() throws → error propagates out of useRefFromSource (no defensive catch)", () => {
    // The composable does not wrap subscribe() in try/catch — if the source
    // is malformed and throws synchronously during subscribe, the error
    // bubbles up to the surrounding setup() and crashes the component.
    // This is current behaviour and the simplest contract: a throwing
    // subscribe is a programmer error in the source, not something the
    // composable should silently swallow.
    const throwingSource = {
      subscribe() {
        throw new Error("source.subscribe boom");
      },
      getSnapshot() {
        return { value: "initial" };
      },
      // Intentional no-op: this source is built to throw on subscribe; we
      // never reach destroy() in this test, but the contract requires the
      // method to exist.
      destroy() {
        /* no-op */
      },
    } as RouterSource<{ value: string }>;

    const scope = effectScope();

    expect(() => {
      scope.run(() => {
        useRefFromSource(throwingSource);
      });
    }).toThrow(/source\.subscribe boom/);

    scope.stop();
  });
});

describe("setupRouteProvision — idempotent unsubscribe contract", () => {
  it("calling the returned unsubscribe() twice is a no-op the second time (does not throw, does not double-emit)", () => {
    // Internal helper used by both RouterProvider and createRouterPlugin.
    // Both call sites currently invoke `unsubscribe()` exactly once in
    // onScopeDispose / app.onUnmount. Lock the idempotency contract so a
    // future refactor that adds a second teardown call (e.g. a redundant
    // safety net) does not crash, and so the underlying router source
    // does not see a stale listener removal.
    const router = createTestRouterWithADefaultRouter();
    const { unsubscribe } = setupRouteProvision(router);

    // First call is the real teardown.
    expect(() => {
      unsubscribe();
    }).not.toThrow();

    // Second call must NOT throw. Whether the source treats it as a no-op
    // or a redundant unsubscribe is the source's contract; we only assert
    // the visible behaviour at the composable boundary.
    expect(() => {
      unsubscribe();
    }).not.toThrow();
    // Third call is the strongest regression net.
    expect(() => {
      unsubscribe();
    }).not.toThrow();

    router.stop();
  });

  it("after unsubscribe(), navigation events do NOT mutate the returned route refs", async () => {
    // Confirm that unsubscribe() actually severs the source → ref wiring.
    // This is the inverse of the "leak" test for useRefFromSource: here we
    // verify that the teardown channel works.
    const router = createTestRouterWithADefaultRouter();
    const { route, unsubscribe } = setupRouteProvision(router);

    await router.start("/home");

    // Before unsubscribe, route should reflect the home navigation.
    expect(route.value?.name).toBe("home");

    unsubscribe();

    const before = route.value;

    await router.navigate("about");

    // After unsubscribe, the ref must be frozen on the pre-teardown value.
    expect(route.value).toBe(before);

    router.stop();
  });

  it("source.subscribe is invoked exactly once per setupRouteProvision call (no double-subscribe under retry/HMR scenarios)", () => {
    // Defensive sanity: each provider tree gets one subscription. Pin so
    // a future change that adds e.g. an "initial snapshot replay" does not
    // accidentally double-bind without a corresponding double-teardown.
    const router = createTestRouterWithADefaultRouter();
    const subscribeSpy = vi.spyOn(router, "subscribe");

    const { unsubscribe } = setupRouteProvision(router);

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    unsubscribe();
    subscribeSpy.mockRestore();
    router.stop();
  });
});
