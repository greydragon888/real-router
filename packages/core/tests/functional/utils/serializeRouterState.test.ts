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

  it("roundtrip: serialize then parse preserves name/params/path/context (only transition stripped)", () => {
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

  describe("excludeContext option", () => {
    it("strips named namespaces from output", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: {
          data: { a: 1 },
          rsc: () => null,
        } as unknown as State["context"],
        transition: baseTransition,
      };

      const json = serializeRouterState(state, { excludeContext: ["rsc"] });
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      expect(parsed.context).toStrictEqual({ data: { a: 1 } });
      expect(parsed.context).not.toHaveProperty("rsc");
    });

    it("preserves other namespaces when excluding one", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: {
          data: { x: 1 },
          rsc: { y: 2 },
          source: "server",
        } as unknown as State["context"],
        transition: baseTransition,
      };

      const json = serializeRouterState(state, { excludeContext: ["rsc"] });
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      expect(parsed.context).toStrictEqual({
        data: { x: 1 },
        source: "server",
      });
    });

    it("is a no-op when excludeContext is empty array", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: { data: { x: 1 } } as unknown as State["context"],
        transition: baseTransition,
      };

      const jsonNoOpt = serializeRouterState(state);
      const jsonEmptyOpt = serializeRouterState(state, { excludeContext: [] });

      expect(jsonEmptyOpt).toBe(jsonNoOpt);
    });

    it("is a no-op when options is empty object", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: { data: { x: 1 } } as unknown as State["context"],
        transition: baseTransition,
      };

      const jsonNoOpt = serializeRouterState(state);
      const jsonEmptyOptions = serializeRouterState(state, {});

      expect(jsonEmptyOptions).toBe(jsonNoOpt);
    });

    it("strips multiple namespaces", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: {
          data: { a: 1 },
          rsc: { node: "x" },
          internal: { z: true },
          keep: { ok: 1 },
        } as unknown as State["context"],
        transition: baseTransition,
      };

      const json = serializeRouterState(state, {
        excludeContext: ["rsc", "internal"],
      });
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      expect(parsed.context).toStrictEqual({
        data: { a: 1 },
        keep: { ok: 1 },
      });
    });
  });
});
