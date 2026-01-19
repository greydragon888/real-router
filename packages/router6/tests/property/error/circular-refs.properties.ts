import { fc, test } from "@fast-check/vitest";
import { describe } from "vitest";

import { RouterError } from "router6";

import type { Params, State } from "router6-types";

describe("RouterError Circular References Properties", () => {
  describe("Handling circular references in params", () => {
    test("deepFreezeState handles circular reference in params", () => {
      // Create State with circular reference
      const params: Params = { foo: "bar" };

      // Add circular reference
      params.self = params;

      const state: State = {
        name: "test",
        path: "/test",
        params,
        meta: undefined,
      };

      // deepFreezeState should handle circular references via structuredClone
      const err = new RouterError("ERR", { redirect: state });

      // Redirect should be frozen and should not throw errors
      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(err.redirect?.name).toBe("test");
      expect(err.redirect?.path).toBe("/test");

      return true;
    });

    test("deepFreezeState handles nested circular reference", () => {
      const nested: Record<string, unknown> = { value: "test" };

      nested.circular = nested;

      const params: Params = {
        nested: nested as Params,
      };

      const state: State = {
        name: "route",
        path: "/route",
        params,
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(
        (err.redirect?.params.nested as Record<string, unknown> | undefined)
          ?.value,
      ).toBe("test");

      return true;
    });

    test("deepFreezeState handles circular reference through array", () => {
      const arr: unknown[] = [1, 2, 3];

      arr.push(arr); // Circular reference

      const params: Params = {
        array: arr as Params[],
      };

      const state: State = {
        name: "test",
        path: "/test",
        params,
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(err.redirect?.params.array).toHaveLength(4);

      return true;
    });
  });

  describe("Handling circular references in meta", () => {
    test("deepFreezeState handles circular reference in meta.params", () => {
      const metaParams: Params = { foo: "bar" };

      metaParams.self = metaParams;

      const state: State = {
        name: "test",
        path: "/test",
        params: {},
        meta: {
          id: 1,
          params: metaParams,
          options: {},
          redirected: false,
        },
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(
        (err.redirect?.meta as { params: { foo: string } } | undefined)?.params
          .foo,
      ).toBe("bar");

      return true;
    });

    test("deepFreezeState handles circular reference in meta.options.state", () => {
      const optionsState: Record<string, unknown> = { value: "test" };

      optionsState.circular = optionsState;

      const state: State = {
        name: "test",
        path: "/test",
        params: {},
        meta: {
          id: 1,
          params: {},
          options: {
            state: optionsState,
          },
          redirected: false,
        },
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(
        (
          err.redirect?.meta as
            | { options: { state: Record<string, unknown> } }
            | undefined
        )?.options.state.value,
      ).toBe("test");

      return true;
    });
  });

  describe("Complex circular references", () => {
    test("deepFreezeState handles multiple circular references", () => {
      const obj1: Record<string, unknown> = { id: 1 };
      const obj2: Record<string, unknown> = { id: 2 };

      // Mutual references
      obj1.ref = obj2;
      obj2.ref = obj1;

      const state: State = {
        name: "test",
        path: "/test",
        params: {
          obj1: obj1 as Params,
          obj2: obj2 as Params,
        },
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(
        (err.redirect?.params.obj1 as Record<string, unknown> | undefined)?.id,
      ).toBe(1);
      expect(
        (err.redirect?.params.obj2 as Record<string, unknown> | undefined)?.id,
      ).toBe(2);

      return true;
    });

    test("deepFreezeState handles deep circular references", () => {
      const level3: Record<string, unknown> = { value: 3 };
      const level2: Record<string, unknown> = { value: 2, child: level3 };
      const level1: Record<string, unknown> = { value: 1, child: level2 };

      // Create circular reference from level3 back to level1
      level3.root = level1;

      const state: State = {
        name: "test",
        path: "/test",
        params: {
          data: level1 as Params,
        },
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(
        (err.redirect?.params.data as Record<string, unknown> | undefined)
          ?.value,
      ).toBe(1);
      expect(
        (
          (err.redirect?.params.data as Record<string, unknown> | undefined)
            ?.child as Record<string, unknown> | undefined
        )?.value,
      ).toBe(2);

      return true;
    });
  });

  describe("Immutability after freeze with circular references", () => {
    test("frozen State with circular references cannot be modified", () => {
      const params: Params = { foo: "bar" };

      params.self = params;

      const state: State = {
        name: "test",
        path: "/test",
        params,
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });
      const frozenState = err.redirect;

      expect(frozenState).toBeDefined();
      expect(Object.isFrozen(frozenState)).toBe(true);
      if (frozenState) {
        expect(Object.isFrozen(frozenState.params)).toBe(true);

        // Modification attempt should be ignored or throw error in strict mode
        try {
          (frozenState.params as Record<string, unknown>).foo = "modified";
        } catch {
          // Expected in strict mode
        }

        // Value should not change
        expect(frozenState.params.foo).toBe("bar");
      }

      return true;
    });
  });

  describe("Property-based tests with arbitrary State", () => {
    test.prop(
      [
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          path: fc.string({ minLength: 1, maxLength: 50 }),
          params: fc.dictionary(fc.string(), fc.anything(), { maxKeys: 5 }),
          meta: fc.option(
            fc.record({
              params: fc.dictionary(fc.string(), fc.anything(), { maxKeys: 3 }),
              options: fc.record({}),
            }),
          ),
        }),
      ],
      { numRuns: 1000 },
    )(
      "deepFreezeState always successfully handles arbitrary State (without circular references)",
      (state) => {
        // Note: fc.anything() does not generate circular references, but may contain
        // any other data types
        const err = new RouterError("ERR", { redirect: state as State });
        const frozenState = err.redirect;

        if (frozenState) {
          expect(Object.isFrozen(frozenState)).toBe(true);
          expect(frozenState.name).toBe(state.name);
          expect(frozenState.path).toBe(state.path);
        }

        return true;
      },
    );
  });

  describe("Edge cases", () => {
    test("deepFreezeState handles empty objects with circular references", () => {
      const empty: Record<string, unknown> = {};

      empty.self = empty;

      const state: State = {
        name: "test",
        path: "/test",
        params: { empty: empty as Params },
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);

      return true;
    });

    test("deepFreezeState handles arrays with circular references", () => {
      const arr: unknown[] = [];

      arr.push(arr); // Circular reference to itself

      const state: State = {
        name: "test",
        path: "/test",
        params: { arr: arr as Params[] },
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(Array.isArray(err.redirect?.params.arr)).toBe(true);

      return true;
    });

    test("deepFreezeState handles null in State", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { nullValue: null },
        meta: undefined,
      };

      const err = new RouterError("ERR", { redirect: state });

      expect(Object.isFrozen(err.redirect)).toBe(true);
      expect(err.redirect?.params.nullValue).toBeNull();
      expect(err.redirect?.meta).toBeUndefined();

      return true;
    });
  });
});
