import { describe, it, expect } from "vitest";

import { serializeRouterState } from "@real-router/ssr-utils";

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
        },
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
        },
        transition: baseTransition,
      };

      const json = serializeRouterState(state, { excludeContext: ["rsc"] });
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      expect(parsed.context).toStrictEqual({
        data: { x: 1 },
        source: "server",
      });
    });

    it("preserves an own __proto__ namespace through the exclude filter (#1191)", () => {
      const context: Record<string, unknown> = { data: { x: 1 } };

      // Simulate what claimContextNamespace.write now creates: an own
      // "__proto__" key (not a prototype swap).
      Object.defineProperty(context, "__proto__", {
        value: { secret: 42 },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context,
        transition: baseTransition,
      };

      const json = serializeRouterState(state, { excludeContext: ["rsc"] });
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      // Pre-fix: the exclude path rebuilds via `filtered[key] = value` on a
      // plain {}, so `filtered["__proto__"] = value` swaps the prototype and
      // the data is silently dropped from the serialized output.
      expect(Object.keys(parsed.context)).toContain("__proto__");
      expect(parsed.context.__proto__).toStrictEqual({ secret: 42 });
    });

    it("is a no-op when excludeContext is empty array", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: { data: { x: 1 } },
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
        context: { data: { x: 1 } },
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
        },
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

  describe("custom serialize option (#606)", () => {
    it("delegates to options.serialize for non-JSON types", () => {
      const date = new Date("2026-05-08T10:00:00.000Z");

      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: { data: { when: date } },
        transition: baseTransition,
      };

      const tag = (val: unknown): unknown => {
        if (val instanceof Date) {
          return { __t: "Date", v: val.toISOString() };
        }

        if (val !== null && typeof val === "object") {
          const out: Record<string, unknown> = {};

          for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            out[k] = tag(v);
          }

          return out;
        }

        return val;
      };

      const serialize = (data: unknown): string => JSON.stringify(tag(data));

      const json = serializeRouterState(state, { serialize });
      const parsed = JSON.parse(json) as {
        context: { data: { when: { __t: string; v: string } } };
      };

      expect(parsed.context.data.when).toStrictEqual({
        __t: "Date",
        v: date.toISOString(),
      });
    });

    it("composes excludeContext + serialize: namespace stripped before custom serializer runs", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: {
          data: { a: 1 },
          rsc: () => null,
        },
        transition: baseTransition,
      };

      let seenKeys: string[] = [];

      const serialize = (data: unknown): string => {
        seenKeys = Object.keys(
          (data as { context: Record<string, unknown> }).context,
        );

        return JSON.stringify(data);
      };

      serializeRouterState(state, {
        excludeContext: ["rsc"],
        serialize,
      });

      expect(seenKeys).toStrictEqual(["data"]);
    });

    it("XSS-escape applies to custom serializer output", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: {},
        transition: baseTransition,
      };

      const serialize = (data: unknown): string =>
        `${JSON.stringify(data)}<script>`;

      const json = serializeRouterState(state, { serialize });

      expect(json).not.toContain("<");
      expect(json).not.toContain(">");
      expect(json).toContain(String.raw`\u003c`);
      expect(json).toContain(String.raw`\u003e`);
    });

    it("falls back to JSON.stringify when serialize is omitted", () => {
      const state: State = {
        name: "page",
        params: {},
        path: "/page",
        context: { data: { a: 1 } },
        transition: baseTransition,
      };

      const jsonNoOpt = serializeRouterState(state);
      const jsonExplicitJson = serializeRouterState(state, {
        serialize: JSON.stringify,
      });

      expect(jsonExplicitJson).toBe(jsonNoOpt);
    });
  });
});
