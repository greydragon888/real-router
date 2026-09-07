// packages/core/tests/functional/routes/tree-changed-payload-readonly-1963.test.ts

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { TreeChangedEvent } from "@real-router/core/types";

/**
 * A `TREE_CHANGED` payload is read-only in the TYPE, not only in the prose
 * (#1963).
 *
 * ⚑ The runtime reason this type EXISTED has been fixed, and the type is still
 * the right layer. When #1963 was written the two layers failed differently and
 * only one was loud: the shell was frozen and threw, while the nested config was
 * aliased and corrupted in silence — the router's answer AND the caller's own
 * object, one write moving both. #2172 adopted those bags, so both layers are
 * loud now, and the runtime cell below pins that rather than the old asymmetry.
 *
 * ⚠ Which does NOT make the type redundant: a `TypeError` at runtime is a
 * production failure, and the compile error is what stops the write from being
 * written. The type cells below are the subject; the runtime cells are what keeps
 * them honest — a type that forbids a write nothing performs would be
 * decoration.
 */
describe("TREE_CHANGED payload — read-only in the type (#1963)", () => {
  describe("runtime — the two layers fail differently, and that is the reason", () => {
    it("both layers throw — the shell and the nested config alike", () => {
      const callerBag = { id: "1" };
      const router = createRouter([{ name: "a", path: "/a" }]);

      let event: Extract<TreeChangedEvent, { op: "add" }> | undefined;
      const unsubscribe = getRoutesApi(router).subscribeChanges((received) => {
        if (received.op === "add") {
          event = received;
        }
      });

      getRoutesApi(router).add({
        name: "p",
        path: "/p/:id",
        defaultParams: callerBag,
      });
      unsubscribe();

      const route = event?.added[0];

      expect(route).toBeDefined();
      expect(Object.isFrozen(route)).toBe(true);

      // The shell, frozen since #1963.
      expect(() => {
        (route as unknown as { name: string }).name = "x";
      }).toThrow(TypeError);

      // ⚑ And the nested bag since #2172. This is the half that used to be
      // SILENT: the bag was the live store's object and the caller's at once, so
      // one write moved the router's answer and the application's own literal
      // together, with nothing reporting it. Measured then: `buildPath("p", {})`
      // answered `/p/x` and `callerBag.id` had become `"x"`.
      expect(() => {
        (route as unknown as { defaultParams: Params }).defaultParams.id = "x";
      }).toThrow(TypeError);

      expect(router.buildPath("p", {})).toBe("/p/1");
      expect(callerBag.id, "the caller's own literal is untouched").toBe("1");

      router.dispose();
    });
  });

  describe("type — every layer the runtime punishes is a compile error", () => {
    // ⚠ DECLARED, never called. The subject is the compiler's verdict, and the
    // operands are casts of `{}` — executing them would only crash on the
    // absent array and say nothing about the type.
    function addPayloadCells(): void {
      const event = {} as Extract<TreeChangedEvent, { op: "add" }>;

      // @ts-expect-error -- the SHELL: this write throws at runtime (#1963)
      event.added[0].name = "x";

      // @ts-expect-error -- the NESTED config: this write corrupts silently
      event.added[0].defaultParams!.id = "x";

      // CONTROL. Rejected before #1963 and after it — its directive is what
      // shows these cells are type-checked at all. Remove the fix and the two
      // above become `TS2578 Unused '@ts-expect-error'`; this one never does.
      // @ts-expect-error -- the ARRAY has always been `readonly`
      event.added.push({ name: "z", path: "/z" });
    }

    // The function arm of `ReadonlyDeep` is what keeps a route's callbacks
    // CALLABLE — a homomorphic mapped type over a function maps its properties
    // and drops the call signature. Nothing else in the suite reaches a payload
    // route's `canActivate`, so without this cell the arm could be deleted and
    // every other cell would stay green.
    function callableThroughThePayload(): void {
      const event = {} as Extract<TreeChangedEvent, { op: "add" }>;
      const route = event.added[0];

      void route.canActivate?.(undefined as never, undefined as never);
      void route.encodeParams?.({ params: {}, search: {} });
    }

    function siblingPayloadCells(): void {
      const removed = {} as Extract<TreeChangedEvent, { op: "remove" }>;
      const replaced = {} as Extract<TreeChangedEvent, { op: "replace" }>;

      // @ts-expect-error -- `remove` names what it spliced out (#1757)
      removed.removedSubtree[0].name = "x";

      // @ts-expect-error -- `replace` reports a diff, both halves
      replaced.removed[0].name = "x";

      // @ts-expect-error -- the NESTED config on the `replace` payload too
      replaced.added[0].defaultParams!.id = "x";
    }

    it("the cells above are type-checked, not executed", () => {
      expect(typeof addPayloadCells).toBe("function");
      expect(typeof callableThroughThePayload).toBe("function");
      expect(typeof siblingPayloadCells).toBe("function");
    });
  });
});

type Params = Record<string, unknown>;
