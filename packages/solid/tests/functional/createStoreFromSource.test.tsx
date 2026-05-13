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

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("cleanups created outside a `createRoot`"),
    );

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
});
