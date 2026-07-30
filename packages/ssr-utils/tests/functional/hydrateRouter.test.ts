import { errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";

import { createTestRouter } from "../helpers";

import type { Router, State } from "@real-router/core";

describe("hydrateRouter", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("hydrates from a serialized JSON string by delegating to start(state.path)", async () => {
    const serverState: State = {
      name: "users.view",
      params: { id: "42" },
      search: {},
      path: "/users/view/42",
      context: {},
      transition: {
        phase: "activating",
        reason: "success",
        segments: { deactivated: [], activated: [], intersection: "" },
      },
    };

    const json = serializeRouterState(serverState);
    const result = await hydrateRouter(router, json);

    expect(result.name).toBe("users.view");
    expect(result.params).toStrictEqual({ id: "42" });
    expect(result.path).toBe("/users/view/42");
    expect(router.isActive()).toBe(true);
  });

  it("hydrates from an object containing path", async () => {
    const result = await hydrateRouter(router, { path: "/users/list" });

    expect(result.name).toBe("users.list");
    expect(router.getState()?.name).toBe("users.list");
  });

  it("accepts a full State object — extra fields are ignored, only path is used", async () => {
    const fullState: State = {
      name: "stale.from.server",
      params: { id: "999" },
      search: {},
      path: "/users/list",
      context: { data: "payload" },
      transition: {
        phase: "activating",
        reason: "success",
        segments: { deactivated: [], activated: [], intersection: "" },
      },
    };

    const result = await hydrateRouter(router, fullState);

    // Client re-resolves the path: name/params come from matchPath, NOT from
    // server's stale State fields. Confirms path-only contract.
    expect(result.name).toBe("users.list");
    expect(result.params).toStrictEqual({});
    expect(result.path).toBe("/users/list");
  });

  it("propagates ROUTE_NOT_FOUND when client cannot match the path", async () => {
    const router2 = createTestRouter({ allowNotFound: false });

    await expect(
      hydrateRouter(router2, { path: "/nonexistent" }),
    ).rejects.toMatchObject({ code: errorCodes.ROUTE_NOT_FOUND });

    router2.stop();
  });

  describe("hydration scratchpad (#596)", () => {
    it("exposes parsed state via getInternals().hydrationState during start interceptor", async () => {
      const serverState: State = {
        name: "users.view",
        params: { id: "42" },
        search: {},
        path: "/users/view/42",
        context: { data: { user: { id: "42", name: "Alice" } } },
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
      };

      let observedDuringStart: ReturnType<
        typeof getInternals
      >["hydrationState"] = null;

      const removeInterceptor = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          observedDuringStart = getInternals(router).hydrationState;

          return next(path);
        },
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      expect(observedDuringStart).not.toBeNull();
      expect(observedDuringStart).toMatchObject({
        name: "users.view",
        params: { id: "42" },
        path: "/users/view/42",
        context: { data: { user: { id: "42", name: "Alice" } } },
      });

      removeInterceptor();
    });

    it("clears hydrationState after start resolves", async () => {
      expect(getInternals(router).hydrationState).toBeNull();

      await hydrateRouter(router, { path: "/users/list" });

      expect(getInternals(router).hydrationState).toBeNull();
    });

    it("clears hydrationState even if start rejects", async () => {
      const router2 = createTestRouter({ allowNotFound: false });

      await expect(
        hydrateRouter(router2, { path: "/nonexistent" }),
      ).rejects.toMatchObject({ code: errorCodes.ROUTE_NOT_FOUND });

      expect(getInternals(router2).hydrationState).toBeNull();

      router2.stop();
    });

    it("returns null for pure CSR start() (no hydrateRouter)", async () => {
      let observedDuringStart: ReturnType<
        typeof getInternals
      >["hydrationState"] = null;

      const removeInterceptor = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          observedDuringStart = getInternals(router).hydrationState;

          return next(path);
        },
      );

      await router.start("/home");

      expect(observedDuringStart).toBeNull();

      removeInterceptor();
    });

    it("subsequent start() calls after hydrateRouter see null hydrationState", async () => {
      await hydrateRouter(router, { path: "/users/list" });
      router.stop();

      let observedDuringSecondStart: ReturnType<
        typeof getInternals
      >["hydrationState"] = null;
      let secondCallSeen = false;

      const removeInterceptor = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          if (secondCallSeen) {
            observedDuringSecondStart = getInternals(router).hydrationState;
          }

          secondCallSeen = true;

          return next(path);
        },
      );

      await router.start("/home");

      expect(observedDuringSecondStart).toBeNull();

      removeInterceptor();
    });
  });

  describe("custom deserialize option (#606)", () => {
    it("uses options.deserialize instead of JSON.parse", async () => {
      const calls: string[] = [];

      const deserialize = (json: string): unknown => {
        calls.push(json);

        return JSON.parse(json) as unknown;
      };

      const json = serializeRouterState({
        name: "users.list",
        params: {},
        search: {},
        path: "/users/list",
        context: {},
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
      });

      const result = await hydrateRouter(router, json, { deserialize });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(json);
      expect(result.name).toBe("users.list");
    });

    it("does not call deserialize when source is an object", async () => {
      let called = false;

      const deserialize = (): unknown => {
        called = true;

        return null;
      };

      await hydrateRouter(router, { path: "/users/list" }, { deserialize });

      expect(called).toBe(false);
    });

    it("round-trips Date in state.context via paired serialize/deserialize", async () => {
      interface Tagged {
        __t: "Date";
        v: string;
      }

      const isTagged = (val: unknown): val is Tagged =>
        typeof val === "object" &&
        val !== null &&
        (val as { __t?: unknown }).__t === "Date" &&
        typeof (val as { v?: unknown }).v === "string";

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

      const deserialize = (json: string): unknown =>
        JSON.parse(json, (_key, value: unknown) =>
          isTagged(value) ? new Date(value.v) : value,
        );

      const date = new Date("2026-05-08T10:00:00.000Z");

      const serverState: State = {
        name: "users.list",
        params: {},
        search: {},
        path: "/users/list",
        context: { data: { fetchedAt: date } },
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
      };

      const json = serializeRouterState(serverState, { serialize });

      let observed: ReturnType<typeof getInternals>["hydrationState"] = null;

      const removeInterceptor = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          observed = getInternals(router).hydrationState;

          return next(path);
        },
      );

      await hydrateRouter(router, json, { deserialize });

      removeInterceptor();

      const parsedContext = (observed as unknown as State).context as {
        data: { fetchedAt: unknown };
      };

      expect(parsedContext.data.fetchedAt).toBeInstanceOf(Date);
      expect((parsedContext.data.fetchedAt as Date).toISOString()).toBe(
        date.toISOString(),
      );
    });
  });
});
