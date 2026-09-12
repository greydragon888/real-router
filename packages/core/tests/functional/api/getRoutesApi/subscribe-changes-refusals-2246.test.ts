import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

describe("subscribeChanges — the shape of its handler", () => {
  let router: Router;
  let routesApi: RoutesApi;

  beforeEach(() => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  // #2246. The criterion's second half — a DEFERRED CRASH in a user-facing API.
  // The emitter stores whatever it is handed and isolates the call, so a
  // non-function registers cleanly, hands back a working `Unsubscribe`, and then
  // logs on every structural mutation for the life of the router: a registration
  // that reported success and never works.
  describe("refuses what the emitter cannot call (#2246)", () => {
    const raw = (): { subscribeChanges: (handler: unknown) => unknown } =>
      routesApi as never;

    const NOT_FUNCTIONS: readonly (readonly [label: string, value: unknown])[] =
      [
        ["undefined", undefined],
        ["null", null],
        ["a number", 42],
        ["a string", "handler"],
        ["a plain object", {}],
        ["an array", []],
      ];

    it("refuses every non-function handler", () => {
      expect(NOT_FUNCTIONS).toHaveLength(6);

      for (const [label, value] of NOT_FUNCTIONS) {
        expect(
          () => raw().subscribeChanges(value),
          `${label} must be refused`,
        ).toThrow(TypeError);
      }
    });

    it("names the door", () => {
      expect(() => raw().subscribeChanges(42)).toThrow(
        /\[router\.subscribeChanges\] Expected a function/,
      );
    });

    // The asymmetry `subscribeLeave` already records: `@real-router/rx` exposes
    // the Observable pattern for TRANSITIONS, not for tree mutations, so steering
    // a mis-typed tree-change handler toward it would mislead.
    it("carries no @real-router/rx hint, unlike subscribe", () => {
      expect(() => raw().subscribeChanges(42)).toThrow(TypeError);

      try {
        raw().subscribeChanges(42);

        expect.unreachable("the door must refuse");
      } catch (error) {
        expect((error as Error).message).not.toMatch(/rx/);
      }

      // Its guarded sibling DOES carry the hint — without this the assertion
      // above passes on a door that simply says nothing.
      expect(() => router.subscribe(42 as never)).toThrow(/@real-router\/rx/);
    });

    // CONTROL — without it every assertion above is satisfied by a door that
    // refuses everything.
    it("CONTROL — a real handler subscribes, fires and unsubscribes", () => {
      let hits = 0;

      const unsubscribe = raw().subscribeChanges(() => {
        hits += 1;
      }) as () => void;

      expect(typeof unsubscribe).toBe("function");

      routesApi.add([{ name: "kid", path: "/kid" }]);

      expect(hits).toBe(1);

      unsubscribe();
      routesApi.add([{ name: "kid2", path: "/kid2" }]);

      expect(hits).toBe(1);
    });
  });
});
