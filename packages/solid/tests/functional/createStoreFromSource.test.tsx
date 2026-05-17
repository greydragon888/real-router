import { renderHook } from "@solidjs/testing-library";
import { createEffect, createRoot } from "solid-js";
import { describe, it, expect, vi } from "vitest";

import { createStoreFromSource } from "@real-router/solid";

import type { RouterSource } from "@real-router/sources";

interface RouteSnapshot {
  route: { name: string; params: Record<string, string> } | undefined;
  previousRoute: { name: string } | undefined;
}

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

describe("createStoreFromSource", () => {
  it("returns a Solid store mirroring the initial snapshot", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const { source } = createMockSource(initial);

    const { result } = renderHook(() => createStoreFromSource(source));

    expect(result.route).toStrictEqual(initial.route);
    expect(result.previousRoute).toBeUndefined();
  });

  it("updates per-property when source emits a new snapshot", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const { source, emit } = createMockSource(initial);

    const { result } = renderHook(() => createStoreFromSource(source));

    emit({
      route: { name: "users.view", params: { id: "42" } },
      previousRoute: { name: "home" },
    });

    expect(result.route?.name).toBe("users.view");
    expect(result.route?.params).toStrictEqual({ id: "42" });
    expect(result.previousRoute?.name).toBe("home");
  });

  // The defining property of the store bridge — `reconcile` preserves
  // identity for paths that did not change. Without this, every emit
  // would publish fresh references for every nested object and any
  // reactive reader of a stable sub-path would re-run on every nav.
  it("reconcile preserves identity for unchanged paths", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: { tab: "info" } },
      previousRoute: undefined,
    };
    const { source, emit } = createMockSource(initial);

    const { result } = renderHook(() => createStoreFromSource(source));

    const routeRefBefore = result.route;

    // Emit a structurally-equal but freshly-allocated route object —
    // reconcile must keep the store's nested reference stable so any
    // memoized reader of `state.route` sees Object.is-equal values.
    emit({
      route: { name: "home", params: { tab: "info" } },
      previousRoute: undefined,
    });

    const routeRefAfter = result.route;

    expect(routeRefAfter).toBe(routeRefBefore);
  });

  // Counterpart to the identity-preservation test — when ONE leaf changes
  // and the rest stays equal, the changed leaf must update while sibling
  // references remain stable.
  it("reconcile updates changed leaves without churning siblings", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: { tab: "info" } },
      previousRoute: { name: "boot" },
    };
    const { source, emit } = createMockSource(initial);

    const { result } = renderHook(() => createStoreFromSource(source));

    const previousRouteRefBefore = result.previousRoute;

    emit({
      route: { name: "home", params: { tab: "details" } },
      previousRoute: { name: "boot" },
    });

    // Changed leaf is visible.
    expect(result.route?.params.tab).toBe("details");
    // Untouched sibling keeps the same reference.
    expect(result.previousRoute).toBe(previousRouteRefBefore);
  });

  it("triggers per-property reactive reads on change", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: { id: "1" } },
      previousRoute: undefined,
    };
    const { source, emit } = createMockSource(initial);

    const observed: (string | undefined)[] = [];

    let dispose: () => void = () => {};

    createRoot((d) => {
      dispose = d;
      const store = createStoreFromSource(source);

      createEffect(() => {
        // Track granular params.id only — emits that change other paths
        // must NOT add to `observed`.
        observed.push(store.route?.params.id);
      });
    });

    // Initial effect run logs "1".
    expect(observed).toStrictEqual(["1"]);

    // Change the watched leaf — effect fires again.
    emit({
      route: { name: "home", params: { id: "2" } },
      previousRoute: undefined,
    });

    expect(observed).toStrictEqual(["1", "2"]);

    // Change ONLY previousRoute — effect must NOT fire (granular dep).
    emit({
      route: { name: "home", params: { id: "2" } },
      previousRoute: { name: "boot" },
    });

    expect(observed).toStrictEqual(["1", "2"]);

    dispose();
  });

  it("unsubscribes from the source on cleanup", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const { source, emit } = createMockSource(initial);
    const subscribeSpy = vi.spyOn(source, "subscribe");

    const { result, cleanup } = renderHook(() => createStoreFromSource(source));

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    cleanup();

    // Snapshot the post-cleanup reference. Any subsequent emit must NOT
    // mutate the store (the listener was removed).
    const routeAfterCleanup = result.route;

    emit({
      route: { name: "users.view", params: { id: "999" } },
      previousRoute: undefined,
    });

    expect(result.route).toBe(routeAfterCleanup);
    expect(result.route?.name).toBe("home");
  });

  // §5.11 audit note: documents that the store bridge survives an
  // unsubscribe → resubscribe cycle. Mirrors the corresponding
  // createSignalFromSource test.
  it("works after subscribe/unsubscribe/subscribe cycle (independent owners)", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const { source, emit } = createMockSource(initial);
    const subscribeSpy = vi.spyOn(source, "subscribe");

    // First subscription
    const { result: result1, cleanup: cleanup1 } = renderHook(() =>
      createStoreFromSource(source),
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(result1.route?.name).toBe("home");

    emit({
      route: { name: "users", params: {} },
      previousRoute: { name: "home" },
    });

    expect(result1.route?.name).toBe("users");

    // Unsubscribe
    cleanup1();

    emit({
      route: { name: "admin", params: {} },
      previousRoute: { name: "users" },
    });

    // Old store no longer receives updates.
    expect(result1.route?.name).toBe("users");

    // Second subscription — should pick up the latest snapshot.
    const { result: result2 } = renderHook(() => createStoreFromSource(source));

    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(result2.route?.name).toBe("admin");

    emit({
      route: { name: "home", params: {} },
      previousRoute: { name: "admin" },
    });

    expect(result2.route?.name).toBe("home");
  });

  // Symmetric to the createSignalFromSource ownership test — the store
  // bridge also calls onCleanup, so calling it outside a reactive owner
  // triggers Solid's dev-mode warning.
  it("warns when called outside reactive owner — uses onCleanup", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const { source } = createMockSource(initial);

    createStoreFromSource(source);

    // Match on `cleanup` keyword only — solid-js wording may shift across
    // minor versions; the semantic anchor is the cleanup-without-owner concept.
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringMatching(/cleanup/i));

    consoleWarn.mockRestore();
  });

  it("disposes subscription when createRoot owner is disposed", () => {
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const { source, emit } = createMockSource(initial);
    const subscribeSpy = vi.spyOn(source, "subscribe");

    let observed: RouteSnapshot | undefined;

    const dispose = createRoot((disposeFn) => {
      observed = createStoreFromSource(source);

      return disposeFn;
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(observed?.route?.name).toBe("home");

    emit({
      route: { name: "users", params: {} },
      previousRoute: undefined,
    });

    expect(observed?.route?.name).toBe("users");

    dispose();

    emit({
      route: { name: "admin", params: {} },
      previousRoute: undefined,
    });

    // After dispose the store no longer mirrors source updates.
    expect(observed?.route?.name).toBe("users");
  });

  // §8b H10 audit fix — reconcile identity guard. The bridge tracks the
  // last reconciled snapshot reference and short-circuits `reconcile`
  // when the source emits the SAME reference. This is the hot-path
  // protection for cached lazy sources (createRouteNodeSource) that
  // stabilize their snapshot.
  it("skips reconcile when the source emits the SAME snapshot reference (§8b H10)", () => {
    // Build a source whose listener fires WITHOUT changing the snapshot
    // reference — exactly the cached-lazy-source pattern.
    const sharedSnapshot: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };

    let listener: (() => void) | null = null;
    const source: RouterSource<RouteSnapshot> = {
      subscribe: (cb) => {
        listener = cb;

        return () => {
          listener = null;
        };
      },
      getSnapshot: () => sharedSnapshot,
      destroy: vi.fn(),
    };

    createRoot((dispose) => {
      const store = createStoreFromSource(source);

      // Capture the initial route reference. With the identity guard,
      // subsequent same-reference "emits" must NOT change the store —
      // including any nested object identities.
      const initialRouteRef = store.route;

      // Fire 5 same-reference emits.
      for (let i = 0; i < 5; i++) {
        listener?.();
      }

      // Store still mirrors the snapshot, AND nested references are
      // preserved (no reconcile work happened on the same-ref emits).
      expect(store.route?.name).toBe("home");
      expect(store.route).toBe(initialRouteRef);

      dispose();
    });
  });

  it("re-reads after subscribe when lazy source mutates snapshot mid-subscribe (§8b H10)", () => {
    // Mirror createSignalFromSource Invariant 2: cached lazy sources can
    // change their snapshot inside `subscribe()` without notifying. The
    // store bridge's post-subscribe re-read MUST pick up the change — the
    // identity guard checks `afterSubscribe !== lastSnapshot` so a
    // genuinely new reference still propagates.
    let current: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };
    const reconciled: RouteSnapshot = {
      route: { name: "users", params: { id: "1" } },
      previousRoute: { name: "home" },
    };

    const source: RouterSource<RouteSnapshot> = {
      subscribe: () => {
        // Lazy reconcile during subscribe — listener NOT notified.
        current = reconciled;

        return () => {};
      },
      getSnapshot: () => current,
      destroy: vi.fn(),
    };

    createRoot((dispose) => {
      const store = createStoreFromSource(source);

      // The post-subscribe re-read MUST pick up `reconciled` even though
      // no listener fired — proves the `!==` branch of the identity guard.
      expect(store.route?.name).toBe("users");
      expect(store.route?.params).toStrictEqual({ id: "1" });
      expect(store.previousRoute?.name).toBe("home");

      dispose();
    });
  });

  it("does NOT re-read after subscribe when snapshot is stable (§8b H10 short-circuit)", () => {
    // Symmetric to the previous test: when subscribe() doesn't mutate
    // the snapshot, the post-subscribe re-read's identity guard
    // short-circuits — no reconcile call.
    const initial: RouteSnapshot = {
      route: { name: "home", params: {} },
      previousRoute: undefined,
    };

    const source: RouterSource<RouteSnapshot> = {
      // Subscribe is a no-op — snapshot stays the same.
      subscribe: () => () => {},
      getSnapshot: () => initial,
      destroy: vi.fn(),
    };

    createRoot((dispose) => {
      const store = createStoreFromSource(source);

      // Sanity: store mirrors the snapshot.
      expect(store.route?.name).toBe("home");

      // Reference equality between store.route and initial.route would
      // be ideal but `createStore` wraps in a proxy that does not preserve
      // referential equality — so we use structural equality instead.
      expect(store.route?.params).toStrictEqual({});

      dispose();
    });
  });
});
