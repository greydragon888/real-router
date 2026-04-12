import { describe, it, expect } from "vitest";

import { shouldReplaceHistory } from "../../src";

import type { State } from "@real-router/core";

const STUB_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: Object.freeze({
    deactivated: Object.freeze([]),
    activated: Object.freeze([]),
    intersection: "",
  }),
}) as unknown as State["transition"];

function makeState(path: string): State {
  return {
    name: "test",
    params: {},
    path,
    transition: STUB_TRANSITION,
    context: {},
  };
}

describe("shouldReplaceHistory", () => {
  describe("replace option", () => {
    it("returns true when replace:true", () => {
      const toState = makeState("/a");
      const fromState = makeState("/b");

      expect(
        shouldReplaceHistory({ replace: true }, toState, fromState),
      ).toBe(true);
    });

    it("returns true when replace:true even with fromState undefined", () => {
      const toState = makeState("/a");

      expect(
        shouldReplaceHistory({ replace: true }, toState, undefined),
      ).toBe(true);
    });
  });

  describe("fromState undefined (initial navigation)", () => {
    it("returns true when replace is undefined and fromState is undefined", () => {
      const toState = makeState("/a");

      expect(
        shouldReplaceHistory({}, toState, undefined),
      ).toBe(true);
    });

    it("returns false when replace:false and fromState is undefined (no crash)", () => {
      const toState = makeState("/a");

      expect(
        shouldReplaceHistory({ replace: false }, toState, undefined),
      ).toBe(false);
    });
  });

  describe("reload with same path", () => {
    it("returns true for reload:true + same path when replace:false", () => {
      const state = makeState("/users");

      expect(
        shouldReplaceHistory({ reload: true, replace: false }, state, state),
      ).toBe(true);
    });

    it("returns false for reload:true + different path when replace:false", () => {
      expect(
        shouldReplaceHistory(
          { reload: true, replace: false },
          makeState("/users"),
          makeState("/home"),
        ),
      ).toBe(false);
    });
  });

  describe("regression: #447 — replace:false + fromState:undefined + reload:true", () => {
    it("does not crash when replace:false + reload:true + fromState:undefined", () => {
      // Before fix: TypeError — accessing fromState.path when fromState is undefined
      // After fix: false — replace:false is preserved by ??, reload path comparison safe via ?.
      expect(
        shouldReplaceHistory(
          { reload: true, replace: false },
          makeState("/a"),
          undefined,
        ),
      ).toBe(false);
    });

    it("does not crash when replace:false + reload:false + fromState:undefined", () => {
      expect(
        shouldReplaceHistory(
          { reload: false, replace: false },
          makeState("/a"),
          undefined,
        ),
      ).toBe(false);
    });
  });

  describe("normal navigation", () => {
    it("returns false for non-replace, non-reload with different states", () => {
      expect(
        shouldReplaceHistory(
          { replace: false, reload: false },
          makeState("/users"),
          makeState("/home"),
        ),
      ).toBe(false);
    });

    it("returns false for non-replace, non-reload with same path", () => {
      const state = makeState("/users");

      expect(
        shouldReplaceHistory({ replace: false, reload: false }, state, state),
      ).toBe(false);
    });
  });
});
