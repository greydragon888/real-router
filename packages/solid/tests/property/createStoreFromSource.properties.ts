// packages/solid/tests/property/createStoreFromSource.properties.ts

/**
 * Property-based tests for `createStoreFromSource` — the Solid-specific bridge
 * from `RouterSource<T>` to a `createStore` + `reconcile` snapshot.
 *
 * Invariants:
 *
 * - **Initial state mirrors a spread of getSnapshot()** — the store is
 *   constructed from `{ ...source.getSnapshot() }`, so the values match
 *   field-by-field at creation time.
 * - **Reconcile preserves identity for unchanged paths** — the main reason to
 *   pick a store over a signal. After re-emitting a snapshot in which one
 *   sub-object is shallow-equal but a freshly-allocated reference, that
 *   nested reference must NOT change. This is the granular-reactivity
 *   guarantee — readers of an unchanged path don't see a new reference and
 *   don't re-run.
 * - **Changes are visible per-property** — emitting a snapshot with a single
 *   field change propagates the new value into the store at that path.
 * - **Cleanup unsubscribes** — after the owner disposes, source emits no
 *   longer affect the store.
 */

import { fc, test } from "@fast-check/vitest";
import { createRoot } from "solid-js";
import { describe, expect } from "vitest";

import {
  arbSnapshot,
  createMockSource,
  NUM_RUNS,
  type RouteSnapshotLike,
} from "./helpers";
import { createStoreFromSource } from "../../src/createStoreFromSource";

describe("createStoreFromSource — Property Tests (Solid)", () => {
  describe("Invariant 1: initial state mirrors a spread of getSnapshot()", () => {
    test.prop([arbSnapshot], { numRuns: NUM_RUNS.thorough })(
      "store fields match snapshot fields at creation time",
      (initial) => {
        const { source } = createMockSource(initial);

        createRoot((dispose) => {
          const store = createStoreFromSource(source);

          // Property-level deep value equality.
          expect(store.route).toStrictEqual(initial.route);
          expect(store.previousRoute).toStrictEqual(initial.previousRoute);

          dispose();
        });
      },
    );
  });

  describe("Invariant 2: reconcile preserves identity for unchanged paths", () => {
    // Key correctness property of createStore + reconcile (granular reactivity).
    // Emitting a snapshot where one nested sub-object is structurally equal
    // but freshly allocated must keep the store's nested reference stable.
    test.prop([arbSnapshot], { numRuns: NUM_RUNS.thorough })(
      "structurally-equal route → store.route keeps the same reference",
      (initial) => {
        // We need route to exist to compare its reference across emits.
        fc.pre(initial.route !== undefined);

        const { source, emit } = createMockSource(initial);

        createRoot((dispose) => {
          const store = createStoreFromSource(source);

          const routeRefBefore = store.route;

          // Re-emit a structurally-identical snapshot with a freshly-allocated
          // route object — without reconcile's identity-preserving traversal,
          // the store would publish the new reference.
          emit({
            route: { ...initial.route! },
            previousRoute: initial.previousRoute
              ? { ...initial.previousRoute }
              : undefined,
          });

          const routeRefAfter = store.route;

          expect(routeRefAfter).toBe(routeRefBefore);

          dispose();
        });
      },
    );
  });

  describe("Invariant 3: changes are visible per-property", () => {
    test.prop(
      [arbSnapshot, fc.constantFrom("home", "users", "users.view", "admin")],
      { numRuns: NUM_RUNS.thorough },
    )(
      "emitting a snapshot with a new route.name updates the store path",
      (initial, newName) => {
        fc.pre(initial.route !== undefined && initial.route.name !== newName);

        const { source, emit } = createMockSource(initial);

        createRoot((dispose) => {
          const store = createStoreFromSource(source);

          emit({
            ...initial,
            route: { ...initial.route!, name: newName },
          });

          expect(store.route?.name).toBe(newName);

          dispose();
        });
      },
    );
  });

  describe("Invariant 4: cleanup unsubscribes from the source", () => {
    test.prop([arbSnapshot, arbSnapshot], { numRuns: NUM_RUNS.thorough })(
      "after dispose, source.emit() does not mutate the store",
      (initial, next) => {
        const { source, emit, listeners } = createMockSource(initial);

        let dispose: () => void = () => {};
        let store: RouteSnapshotLike | undefined;

        createRoot((d) => {
          dispose = d;
          store = createStoreFromSource(source);
        });

        expect(listeners()).toBe(1);

        const before = store!.route;

        dispose();

        expect(listeners()).toBe(0);

        emit(next);

        // After dispose, the store snapshot must not have changed.
        expect(store!.route).toBe(before);
      },
    );
  });

  describe("Invariant 5: lazy reconcile after subscribe (§5.8 audit, mirrors createSignalFromSource Inv 2)", () => {
    // Cached lazy sources can reconcile their snapshot inside
    // `onFirstSubscribe` without notifying the just-added listener. The
    // bridge calls `setState(reconcile(source.getSnapshot()))` AFTER
    // `subscribe(...)` to catch that exact window. Mirrors the
    // createSignalFromSource Invariant 2 for store semantics.
    test("snapshot change inside subscribe() is reflected in the store without a notify", () => {
      let current: RouteSnapshotLike = {
        route: { name: "home", params: {} },
        previousRoute: undefined,
      };
      const reconciled: RouteSnapshotLike = {
        route: { name: "users", params: { id: "1" } },
        previousRoute: { name: "home" },
      };

      const source = {
        subscribe: () => {
          // Simulate lazy-reconcile: snapshot mutates during subscribe(),
          // but the bridge's listener is NOT invoked.
          current = reconciled;

          return () => {};
        },
        getSnapshot: () => current,
        destroy: () => {},
      };

      createRoot((dispose) => {
        const store = createStoreFromSource(source);

        // Without the `setState(reconcile(...))` call after subscribe(...),
        // this would still equal "home" — the listener was never called.
        expect(store.route?.name).toBe("users");
        expect(store.route?.params).toStrictEqual({ id: "1" });
        expect(store.previousRoute?.name).toBe("home");

        dispose();
      });
    });
  });

  describe("Invariant 6: runtime null/non-object snapshot (§5.8 defensive — actual behaviour pin)", () => {
    // The signature `<T extends object>` defends at compile time, but a
    // raw `as unknown as object` cast can sneak `null` or a primitive in
    // at runtime. Empirically Solid is more tolerant than the audit
    // predicted:
    //   - `{ ...null }` → `{}` (ES2018 spread is null-safe)
    //   - `{ ...42 }` → `{}` (primitive spread → empty)
    //   - `reconcile(null)` / `reconcile(42)` → silently no-op on the
    //     already-empty store; no TypeError surfaces.
    //
    // Net result: misuse via cast quietly produces an empty store object.
    // This is the EXACT behaviour pinned here — locking it means a future
    // defensive guard (§5.11 top-5 №1) that adds an explicit `throw new
    // Error("createStoreFromSource: snapshot must be a non-null object")`
    // surfaces as a test diff with intent, rather than silently changing
    // the runtime answer.
    test("snapshot=null at construction → empty store, no throw", () => {
      const source = {
        subscribe: () => () => {},
        getSnapshot: () => null as unknown as Record<string, unknown>,
        destroy: () => {},
      };

      let store: Record<string, unknown> | undefined;

      expect(() => {
        createRoot((dispose) => {
          store = createStoreFromSource(source);
          dispose();
        });
      }).not.toThrow();

      expect(store).toBeDefined();
      expect(Object.keys(store!)).toHaveLength(0);
    });

    test("snapshot=primitive (number) at construction → empty store, no throw", () => {
      const source = {
        subscribe: () => () => {},
        getSnapshot: () => 42 as unknown as Record<string, unknown>,
        destroy: () => {},
      };

      let store: Record<string, unknown> | undefined;

      expect(() => {
        createRoot((dispose) => {
          store = createStoreFromSource(source);
          dispose();
        });
      }).not.toThrow();

      expect(store).toBeDefined();
      expect(Object.keys(store!)).toHaveLength(0);
    });
  });
});
