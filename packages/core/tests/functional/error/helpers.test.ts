import { describe, it, expect } from "vitest";

import { DEFAULT_TRANSITION } from "../../../src/constants";
import { deepFreezeState, freezeStateInPlace } from "../../../src/helpers";
import {
  getStateMetaParams,
  setStateMetaParams,
} from "../../../src/stateMetaStore";

import type { Params, State } from "@real-router/types";

describe("deepFreezeState", () => {
  describe("basic functionality", () => {
    it("should freeze a simple state object", () => {
      const state: State = {
        name: "home",
        path: "/",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.params)).toBe(true);
      // deepFreezeState returns a frozen CLONE, not the original
      expect(frozen).not.toBe(state);
      expect(frozen.name).toBe(state.name);
      expect(frozen.path).toBe(state.path);
    });

    it("should freeze state with params", () => {
      const state: State = {
        name: "user",
        path: "/users/123",
        params: { id: "123", tab: "profile" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.params)).toBe(true);

      // Verify immutability
      expect(() => {
        frozen.name = "changed";
      }).toThrow();
    });

    it("should freeze state with meta", () => {
      const state: State = {
        name: "home",
        path: "/",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.params)).toBe(true);
    });
  });

  describe("nested objects", () => {
    it("should freeze deeply nested params", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: {
          level1: {
            level2: {
              level3: {
                value: "deep",
              },
            },
          },
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params)).toBe(true);
      expect(Object.isFrozen(frozen.params.level1 as Params)).toBe(true);
      expect(
        Object.isFrozen((frozen.params.level1 as Params).level2 as Params),
      ).toBe(true);
      expect(
        Object.isFrozen(
          ((frozen.params.level1 as Params).level2 as Params).level3 as Params,
        ),
      ).toBe(true);
    });

    it("should freeze params with arrays", () => {
      const state: State = {
        name: "list",
        path: "/list",
        params: {
          items: [{ id: 1 }, { id: 2 }, { id: 3 }],
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      const items = frozen.params.items as Params[];

      expect(Object.isFrozen(items)).toBe(true);
      expect(Object.isFrozen(items[0])).toBe(true);
      expect(Object.isFrozen(items[1])).toBe(true);
      expect(Object.isFrozen(items[2])).toBe(true);
    });

    it("should freeze very deeply nested structures (5+ levels)", () => {
      const state: State = {
        name: "deep",
        path: "/deep",
        params: {
          a: {
            b: {
              c: {
                d: {
                  e: {
                    f: "very deep",
                  },
                },
              },
            },
          },
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      let current: any = frozen.params;
      const levels = ["a", "b", "c", "d", "e"];

      for (const level of levels) {
        expect(Object.isFrozen(current)).toBe(true);

        current = current[level];
      }

      expect(Object.isFrozen(current)).toBe(true); // f level
    });
  });

  describe("circular references handling", () => {
    it("should handle circular reference in params via structuredClone", () => {
      const state: State = {
        name: "circular",
        path: "/circular",
        params: { value: 1 },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      // Create circular reference
      state.params.self = state.params;

      // structuredClone handles circular references properly
      expect(() => deepFreezeState(state)).not.toThrow();

      const frozen = deepFreezeState(state);

      // Verify the circular structure is preserved in the clone
      expect(frozen.params.self).toBe(frozen.params);
      expect(Object.isFrozen(frozen.params)).toBe(true);
    });

    it("should handle circular reference through nested objects", () => {
      const state: State = {
        name: "nested-circular",
        path: "/nested",
        params: {
          a: { value: "a" },
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      // Create circular reference: a -> b -> a
      const a = state.params.a as Params;

      a.b = { value: "b" };
      (a.b as Params).ref = a;

      // structuredClone handles circular references properly
      expect(() => deepFreezeState(state)).not.toThrow();

      const frozen = deepFreezeState(state);
      const frozenA = frozen.params.a as Params;
      const frozenB = frozenA.b as Params;

      // Verify the circular structure is preserved
      expect(frozenB.ref).toBe(frozenA);
      expect(Object.isFrozen(frozenA)).toBe(true);
      expect(Object.isFrozen(frozenB)).toBe(true);
    });

    it("should handle circular reference in arrays", () => {
      const state: State = {
        name: "array-circular",
        path: "/array",
        params: {
          items: [{ id: 1 }],
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      // Create circular reference in array
      const items = state.params.items as Params[];

      items[0].self = items[0];

      // structuredClone handles circular references properly
      expect(() => deepFreezeState(state)).not.toThrow();

      const frozen = deepFreezeState(state);
      const frozenItems = frozen.params.items as Params[];

      // Verify the circular structure is preserved
      expect(frozenItems[0].self).toBe(frozenItems[0]);
      expect(Object.isFrozen(frozenItems[0])).toBe(true);
    });

    it("should handle multiple circular references", () => {
      const state: State = {
        name: "multi-circular",
        path: "/multi",
        params: {
          obj1: { name: "obj1" },
          obj2: { name: "obj2" },
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      // Create multiple circular references
      const obj1 = state.params.obj1 as Params;
      const obj2 = state.params.obj2 as Params;

      obj1.ref2 = obj2;
      obj2.ref1 = obj1;
      obj1.selfRef = obj1;

      // structuredClone handles circular references properly
      expect(() => deepFreezeState(state)).not.toThrow();

      const frozen = deepFreezeState(state);
      const frozenObj1 = frozen.params.obj1 as Params;
      const frozenObj2 = frozen.params.obj2 as Params;

      // Verify the circular structure is preserved
      expect(frozenObj1.ref2).toBe(frozenObj2);
      expect(frozenObj2.ref1).toBe(frozenObj1);
      expect(frozenObj1.selfRef).toBe(frozenObj1);
      expect(Object.isFrozen(frozenObj1)).toBe(true);
      expect(Object.isFrozen(frozenObj2)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle null state by returning it", () => {
      const result = deepFreezeState(null as unknown as State);

      expect(result).toBeNull();
    });

    it("should handle undefined state by returning it", () => {
      const result = deepFreezeState(undefined as unknown as State);

      expect(result).toBeUndefined();
    });

    it("should throw TypeError for invalid state structure", () => {
      expect(() => {
        deepFreezeState({ invalid: "structure" } as unknown as State);
      }).toThrow(TypeError);

      expect(() => {
        deepFreezeState({ invalid: "structure" } as unknown as State);
      }).toThrow(/Expected valid State object/);
    });

    it("should throw TypeError for primitive values", () => {
      // Truthy primitives should fail isState check
      expect(() => {
        deepFreezeState(42 as unknown as State);
      }).toThrow(TypeError);

      expect(() => {
        deepFreezeState("not an object" as unknown as State);
      }).toThrow(TypeError);

      expect(() => {
        deepFreezeState(true as unknown as State);
      }).toThrow(TypeError);
    });

    it("should handle state with empty params", () => {
      const state: State = {
        name: "empty",
        path: "/empty",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params)).toBe(true);
    });

    it("should handle params with null values", () => {
      const state: State = {
        name: "null-param",
        path: "/null",
        params: { value: null as any },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params)).toBe(true);
      expect(frozen.params.value).toBeNull();
    });

    it("should handle params with undefined values", () => {
      const state: State = {
        name: "undefined-param",
        path: "/undefined",
        params: { value: undefined },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params)).toBe(true);
      expect(frozen.params.value).toBeUndefined();
    });

    it("should handle params with mixed primitive types", () => {
      const state: State = {
        name: "mixed",
        path: "/mixed",
        params: {
          str: "string",
          num: 123,
          bool: true,
          nullVal: null as any,
          undefVal: undefined,
        },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params)).toBe(true);
      expect(frozen.params.str).toBe("string");
      expect(frozen.params.num).toBe(123);
      expect(frozen.params.bool).toBe(true);
    });

    it("should handle empty arrays in params", () => {
      const state: State = {
        name: "empty-array",
        path: "/empty-array",
        params: { items: [] },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params.items)).toBe(true);
      expect(frozen.params.items).toHaveLength(0);
    });

    it("should handle large arrays efficiently", () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: `item-${i}`,
      }));

      const state: State = {
        name: "large",
        path: "/large",
        params: { items: largeArray },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      const largeItems = frozen.params.items as Params[];

      expect(Object.isFrozen(largeItems)).toBe(true);
      expect(largeItems).toHaveLength(1000);
      // Check a few items are frozen
      expect(Object.isFrozen(largeItems[0])).toBe(true);
      expect(Object.isFrozen(largeItems[500])).toBe(true);
      expect(Object.isFrozen(largeItems[999])).toBe(true);
    });
  });

  describe("immutability verification", () => {
    it("should prevent modification of frozen state", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { id: "123" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(() => {
        frozen.name = "modified";
      }).toThrow();
    });

    it("should prevent modification of frozen params", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { id: "123" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(() => {
        frozen.params.id = "456";
      }).toThrow();
    });

    it("should prevent modification of nested frozen objects", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { nested: { value: "original" } },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(() => {
        (frozen.params.nested as { value: string }).value = "modified";
      }).toThrow();
    });

    it("should prevent adding new properties to frozen objects", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(() => {
        frozen.params.newProp = "added";
      }).toThrow();
    });

    it("should prevent modification of frozen arrays", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { items: [1, 2, 3] },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(() => {
        (frozen.params.items as number[]).push(4);
      }).toThrow();

      expect(() => {
        (frozen.params.items as number[])[0] = 999;
      }).toThrow();
    });
  });

  describe("meta object freezing (deepFreezeState clones — no WeakMap meta)", () => {
    it("should freeze state params deeply", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { source: "navigation" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = deepFreezeState(state);

      expect(Object.isFrozen(frozen.params)).toBe(true);

      expect(() => {
        (frozen.params as Record<string, unknown>).source = "modified";
      }).toThrow();
    });

    it("should handle circular reference in params", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      (state.params as Record<string, unknown>).ref = state.params;

      expect(() => deepFreezeState(state)).not.toThrow();

      const frozen = deepFreezeState(state);

      expect((frozen.params as Record<string, unknown>).ref).toBe(
        frozen.params,
      );
    });
  });
});

// Note: getTypeDescription is an internal function and not exported
// It's tested indirectly through error messages in deepFreezeState

describe("freezeStateInPlace (shallow)", () => {
  describe("basic functionality", () => {
    it("returns same reference and freezes only the top-level State object", () => {
      const state: State = {
        name: "home",
        path: "/",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = freezeStateInPlace(state);

      expect(frozen).toBe(state);
      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it("does NOT freeze nested params — producers freeze at creation", () => {
      const state: State = {
        name: "user",
        path: "/users/123",
        params: { id: "123", tab: "profile" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = freezeStateInPlace(state);

      expect(Object.isFrozen(frozen.params)).toBe(false);
    });

    it("leaves state.context unfrozen so plugins can publish data via claim.write", () => {
      const state: State = {
        name: "home",
        path: "/",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      freezeStateInPlace(state);

      expect(Object.isFrozen(state.context)).toBe(false);
      expect(() => {
        state.context.custom = "written by plugin";
      }).not.toThrow();
      expect(state.context.custom).toBe("written by plugin");
    });

    it("does not freeze internal meta (meta uses WeakMap, not a State field)", () => {
      const state: State = {
        name: "home",
        path: "/",
        params: {},
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      setStateMetaParams(state, { source: "browser" });

      const frozen = freezeStateInPlace(state);

      expect(frozen).toBe(state);
      expect(Object.isFrozen(frozen)).toBe(true);

      const metaParams = getStateMetaParams(frozen);

      expect(metaParams).toBeDefined();
      expect(Object.isFrozen(metaParams)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles null state by returning it", () => {
      const result = freezeStateInPlace(null as unknown as State);

      expect(result).toBeNull();
    });

    it("handles undefined state by returning it", () => {
      const result = freezeStateInPlace(undefined as unknown as State);

      expect(result).toBeUndefined();
    });

    it("is a no-op on already-frozen state (second call returns same reference)", () => {
      const state: State = {
        name: "cached",
        path: "/cached",
        params: { id: "123" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const first = freezeStateInPlace(state);

      expect(first).toBe(state);
      expect(Object.isFrozen(first)).toBe(true);

      const second = freezeStateInPlace(state);

      expect(second).toBe(state);
      expect(second).toBe(first);
    });
  });

  describe("top-level immutability verification", () => {
    it("prevents reassignment of State fields (name, path, params, transition, context)", () => {
      const state: State = {
        name: "test",
        path: "/test",
        params: { id: "123" },
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const frozen = freezeStateInPlace(state);

      expect(() => {
        frozen.name = "modified";
      }).toThrow();

      expect(() => {
        (frozen as unknown as { path: string }).path = "/new";
      }).toThrow();

      expect(() => {
        (frozen as unknown as { context: unknown }).context = { other: 1 };
      }).toThrow();
    });
  });
});
