import { describe, it, expect } from "vitest";

import { mergeStates } from "../../../src/transition/mergeStates";

import type { State, StateMeta, Params } from "@real-router/types";

// Helper to create a minimal valid State
function createState(
  overrides: Partial<State> = {},
  metaOverrides: Partial<StateMeta> = {},
): State {
  const baseMeta: StateMeta = {
    id: 1,
    params: {},
    options: {},
    redirected: false,
    ...metaOverrides,
  };

  return {
    name: "test",
    params: {},
    path: "/test",
    meta: baseMeta,
    ...overrides,
  };
}

describe("transition/mergeStates", () => {
  describe("state fields priority", () => {
    it("should use toState.name over fromState.name", () => {
      const toState = createState({ name: "toRoute" });
      const fromState = createState({ name: "fromRoute" });

      const result = mergeStates(toState, fromState);

      expect(result.name).toBe("toRoute");
    });

    it("should use toState.params over fromState.params", () => {
      const toState = createState({ params: { id: "123" } });
      const fromState = createState({ params: { id: "456", extra: "value" } });

      const result = mergeStates(toState, fromState);

      expect(result.params).toStrictEqual({ id: "123" });
    });

    it("should use toState.path over fromState.path", () => {
      const toState = createState({ path: "/to/path" });
      const fromState = createState({ path: "/from/path" });

      const result = mergeStates(toState, fromState);

      expect(result.path).toBe("/to/path");
    });

    it("should preserve all toState fields when fromState differs", () => {
      const toState = createState({
        name: "users.view",
        params: { userId: "1" },
        path: "/users/1",
      });
      const fromState = createState({
        name: "home",
        params: {},
        path: "/",
      });

      const result = mergeStates(toState, fromState);

      expect(result.name).toBe("users.view");
      expect(result.params).toStrictEqual({ userId: "1" });
      expect(result.path).toBe("/users/1");
    });
  });

  describe("meta fields priority", () => {
    it("should use toState.meta.id over fromState.meta.id", () => {
      const toState = createState({}, { id: 42 });
      const fromState = createState({}, { id: 1 });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.id).toBe(42);
    });

    it("should use default id=1 when both metas have id=1", () => {
      const toState = createState({}, { id: 1 });
      const fromState = createState({}, { id: 1 });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.id).toBe(1);
    });

    it("should use toState.meta.options over fromState.meta.options", () => {
      const toState = createState({}, { options: { reload: true } });
      const fromState = createState({}, { options: { replace: true } });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.options).toStrictEqual({ reload: true });
    });

    it("should use default empty options when both are empty", () => {
      const toState = createState({}, { options: {} });
      const fromState = createState({}, { options: {} });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.options).toStrictEqual({});
    });

    it("should use toState.meta.redirected over fromState.meta.redirected", () => {
      const toState = createState({}, { redirected: true });
      const fromState = createState({}, { redirected: false });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.redirected).toBe(true);
    });

    it("should use default redirected=false when both are false", () => {
      const toState = createState({}, { redirected: false });
      const fromState = createState({}, { redirected: false });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.redirected).toBe(false);
    });
  });

  describe("meta.params merging", () => {
    it("should merge params from both metas", () => {
      const toState = createState({}, { params: { timestamp: 123 } });
      const fromState = createState({}, { params: { source: "guard" } });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).toStrictEqual({
        timestamp: 123,
        source: "guard",
      });
    });

    it("should give fromState.meta.params priority over toState.meta.params", () => {
      const toState = createState({}, { params: { value: "to" } });
      const fromState = createState({}, { params: { value: "from" } });

      const result = mergeStates(toState, fromState);

      // fromState.meta.params overrides toState.meta.params
      expect(result.meta?.params).toStrictEqual({ value: "from" });
    });

    it("should use toState.meta.params when fromState.meta.params is empty", () => {
      const toState = createState({}, { params: { key: "value" } });
      const fromState = createState({}, { params: {} });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).toStrictEqual({ key: "value" });
    });

    it("should use fromState.meta.params when toState.meta.params is empty", () => {
      const toState = createState({}, { params: {} });
      const fromState = createState({}, { params: { key: "value" } });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).toStrictEqual({ key: "value" });
    });

    it("should return empty params when both are empty", () => {
      const toState = createState({}, { params: {} });
      const fromState = createState({}, { params: {} });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).toStrictEqual({});
    });
  });

  describe("meta.source handling", () => {
    it("should use toState.meta.source when defined", () => {
      const toState = createState({}, { source: "middleware" });
      const fromState = createState({}, { source: "guard" });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.source).toBe("middleware");
    });

    it("should use fromState.meta.source when toState.meta.source is undefined", () => {
      const toState = createState({}, {});
      const fromState = createState({}, { source: "guard" });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.source).toBe("guard");
    });

    it("should not include source when both are undefined", () => {
      const toState = createState({}, {});
      const fromState = createState({}, {});

      const result = mergeStates(toState, fromState);

      // source should not be present in meta
      expect("source" in (result.meta ?? {})).toBe(false);
    });
  });

  describe("undefined meta handling", () => {
    it("should handle undefined toState.meta", () => {
      const toState: State = { name: "test", params: {}, path: "/test" };
      const fromState = createState({}, { id: 5, params: { key: "value" } });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.id).toBe(5);
      expect(result.meta?.params).toStrictEqual({ key: "value" });
    });

    it("should handle undefined fromState.meta", () => {
      const toState = createState({}, { id: 10, params: { key: "value" } });
      const fromState: State = { name: "from", params: {}, path: "/from" };

      const result = mergeStates(toState, fromState);

      expect(result.meta?.id).toBe(10);
      expect(result.meta?.params).toStrictEqual({ key: "value" });
    });

    it("should handle both metas undefined", () => {
      const toState: State = { name: "to", params: {}, path: "/to" };
      const fromState: State = { name: "from", params: {}, path: "/from" };

      const result = mergeStates(toState, fromState);

      expect(result.meta?.id).toBe(1);
      expect(result.meta?.options).toStrictEqual({});
      expect(result.meta?.redirected).toBe(false);
      expect(result.meta?.params).toStrictEqual({});
    });

    it("should use defaults when both metas are undefined", () => {
      const toState: State = { name: "test", params: { id: "1" }, path: "/1" };
      const fromState: State = { name: "old", params: {}, path: "/" };

      const result = mergeStates(toState, fromState);

      expect(result.name).toBe("test");
      expect(result.params).toStrictEqual({ id: "1" });
      expect(result.path).toBe("/1");
      expect(result.meta).toStrictEqual({
        id: 1,
        options: {},
        redirected: false,
        params: {},
      });
    });
  });

  describe("immutability", () => {
    it("should not mutate toState", () => {
      const toState = createState(
        { name: "to", params: { a: "1" } },
        { params: { x: "1" } },
      );
      const toStateCopy = structuredClone(toState);
      const fromState = createState(
        { name: "from", params: { b: "2" } },
        { params: { y: "2" } },
      );

      mergeStates(toState, fromState);

      expect(toState).toStrictEqual(toStateCopy);
    });

    it("should not mutate fromState", () => {
      const toState = createState(
        { name: "to", params: { a: "1" } },
        { params: { x: "1" } },
      );
      const fromState = createState(
        { name: "from", params: { b: "2" } },
        { params: { y: "2" } },
      );
      const fromStateCopy = structuredClone(fromState);

      mergeStates(toState, fromState);

      expect(fromState).toStrictEqual(fromStateCopy);
    });

    it("should return a new object", () => {
      const toState = createState();
      const fromState = createState();

      const result = mergeStates(toState, fromState);

      expect(result).not.toBe(toState);
      expect(result).not.toBe(fromState);
    });

    it("should return a new meta object", () => {
      const toState = createState();
      const fromState = createState();

      const result = mergeStates(toState, fromState);

      expect(result.meta).not.toBe(toState.meta);
      expect(result.meta).not.toBe(fromState.meta);
    });

    it("should return a new params object in meta", () => {
      const toState = createState({}, { params: { a: "1" } });
      const fromState = createState({}, { params: { b: "2" } });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).not.toBe(toState.meta?.params);
      expect(result.meta?.params).not.toBe(fromState.meta?.params);
    });
  });

  describe("edge cases", () => {
    it("should handle identical states", () => {
      const state = createState(
        { name: "test", params: { id: "1" }, path: "/test/1" },
        { id: 1, params: { extra: "data" }, options: {}, redirected: false },
      );

      const result = mergeStates(state, state);

      expect(result.name).toBe("test");
      expect(result.params).toStrictEqual({ id: "1" });
      expect(result.path).toBe("/test/1");
      expect(result.meta?.params).toStrictEqual({ extra: "data" });
    });

    it("should handle complex nested params", () => {
      const toState = createState(
        {},
        {
          params: {
            nested: { deep: "value" },
            array: ["a", "b"],
          } as Params,
        },
      );
      const fromState = createState(
        {},
        {
          params: {
            other: "param",
          },
        },
      );

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).toStrictEqual({
        nested: { deep: "value" },
        array: ["a", "b"],
        other: "param",
      });
    });

    it("should handle null values in params", () => {
      const toState = createState({}, { params: { nullable: null } });
      const fromState = createState({}, { params: { other: "value" } });

      const result = mergeStates(toState, fromState);

      expect(result.meta?.params).toStrictEqual({
        nullable: null,
        other: "value",
      });
    });

    it("should handle empty string values", () => {
      const toState = createState(
        { name: "", path: "" },
        { params: { empty: "" } },
      );
      const fromState = createState({}, {});

      const result = mergeStates(toState, fromState);

      expect(result.name).toBe("");
      expect(result.path).toBe("");
      expect(result.meta?.params).toStrictEqual({ empty: "" });
    });
  });

  describe("real-world scenarios", () => {
    it("should handle guard adding timestamp to meta.params", () => {
      const toState = createState(
        { name: "users.view", params: { id: "123" }, path: "/users/123" },
        { id: 5, params: {}, options: {}, redirected: false },
      );
      const fromState = createState(
        { name: "users.view", params: { id: "123" }, path: "/users/123" },
        {
          id: 5,
          params: { timestamp: 1_234_567_890 },
          options: {},
          redirected: false,
        },
      );

      const result = mergeStates(toState, fromState);

      expect(result.name).toBe("users.view");
      expect(result.meta?.params).toStrictEqual({ timestamp: 1_234_567_890 });
    });

    it("should handle middleware setting redirect flag", () => {
      const toState = createState(
        { name: "login", params: {}, path: "/login" },
        { id: 6, params: {}, options: { replace: true }, redirected: true },
      );
      const fromState = createState(
        { name: "dashboard", params: {}, path: "/dashboard" },
        { id: 5, params: {}, options: {}, redirected: false },
      );

      const result = mergeStates(toState, fromState);

      expect(result.name).toBe("login");
      expect(result.meta?.redirected).toBe(true);
      expect(result.meta?.options).toStrictEqual({ replace: true });
    });

    it("should handle multiple guards modifying state chain", () => {
      // Simulate: guard1 -> guard2 -> guard3
      const state1 = createState(
        { name: "route" },
        { params: { guard1: "done" } },
      );
      const state2 = createState(
        { name: "route" },
        { params: { guard2: "done" } },
      );

      const merged1 = mergeStates(state2, state1);

      expect(merged1.meta?.params).toStrictEqual({
        guard1: "done",
        guard2: "done",
      });

      const state3 = createState(
        { name: "route" },
        { params: { guard3: "done" } },
      );

      const merged2 = mergeStates(state3, merged1);

      expect(merged2.meta?.params).toStrictEqual({
        guard1: "done",
        guard2: "done",
        guard3: "done",
      });
    });
  });
});
