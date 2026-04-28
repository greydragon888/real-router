import { describe, it, expect } from "vitest";

import { serializeRouterState } from "../../../src/utils/serializeRouterState";

import type { State } from "@real-router/core";

const baseTransition = {
  phase: "activating" as const,
  reason: "success" as const,
  segments: { deactivated: [], activated: [], intersection: "" },
};

describe("serializeRouterState", () => {
  it("strips state.transition", () => {
    const state: State = {
      name: "users.view",
      params: { id: "1" },
      path: "/users/1",
      context: {},
      transition: baseTransition,
    };

    const json = serializeRouterState(state);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed).toStrictEqual({
      name: "users.view",
      params: { id: "1" },
      path: "/users/1",
      context: {},
    });
    expect(parsed.transition).toBeUndefined();
  });

  it("keeps name, params, path, context", () => {
    const state: State = {
      name: "home",
      params: { foo: "bar" },
      path: "/home?foo=bar",
      context: { data: { hello: "world" } },
      transition: baseTransition,
    };

    const json = serializeRouterState(state);
    const parsed = JSON.parse(json) as State;

    expect(parsed.name).toBe("home");
    expect(parsed.params).toStrictEqual({ foo: "bar" });
    expect(parsed.path).toBe("/home?foo=bar");
    expect(parsed.context).toStrictEqual({ data: { hello: "world" } });
  });

  it("escapes XSS-sensitive characters (delegates to serializeState)", () => {
    const state: State = {
      name: "page",
      params: { html: "</script>" },
      path: "/<>&",
      context: {},
      transition: baseTransition,
    };

    const json = serializeRouterState(state);

    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
    expect(json).not.toContain("&");
    expect(json).toContain(String.raw`\u003c`);
    expect(json).toContain(String.raw`\u003e`);
    expect(json).toContain(String.raw`\u0026`);
  });

  it("roundtrip: serialize then parse produces RouterStartInput-shaped object", () => {
    const state: State = {
      name: "users.list",
      params: {},
      path: "/users/list",
      context: { data: { count: 42 } },
      transition: baseTransition,
    };

    const json = serializeRouterState(state);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.name).toBe(state.name);
    expect(parsed.params).toStrictEqual(state.params);
    expect(parsed.path).toBe(state.path);
    expect(parsed.context).toStrictEqual(state.context);
    expect("transition" in parsed).toBe(false);
  });
});
