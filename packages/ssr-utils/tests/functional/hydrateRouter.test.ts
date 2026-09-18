import { errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  getHydrationState,
  hydrateRouter,
  serializeRouterState,
} from "@real-router/ssr-utils";

import { createTestRouter } from "../helpers";

import type { Router, State } from "@real-router/core";
import type { SerializedRouterState } from "@real-router/ssr-utils";

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

  describe("hydration scratchpad (#596, #2361)", () => {
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

    /** Records what `getHydrationState` answers inside each `start`. */
    function observeStarts(target: Router): {
      seen: (SerializedRouterState | null)[];
      remove: () => void;
    } {
      const seen: (SerializedRouterState | null)[] = [];
      const remove = getPluginApi(target).addInterceptor(
        "start",
        async (next, path) => {
          seen.push(getHydrationState(target));

          return next(path);
        },
      );

      return { seen, remove };
    }

    it("exposes the parsed state through getHydrationState during the start interceptor", async () => {
      const { seen, remove } = observeStarts(router);

      await hydrateRouter(router, serializeRouterState(serverState));

      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        name: "users.view",
        params: { id: "42" },
        path: "/users/view/42",
        context: { data: { user: { id: "42", name: "Alice" } } },
      });

      remove();
    });

    it("returns null once hydrateRouter resolves", async () => {
      expect(getHydrationState(router)).toBeNull();

      await hydrateRouter(router, { path: "/users/list" });

      expect(getHydrationState(router)).toBeNull();
    });

    it("returns null once hydrateRouter rejects", async () => {
      const router2 = createTestRouter({ allowNotFound: false });

      await expect(
        hydrateRouter(router2, { path: "/nonexistent" }),
      ).rejects.toMatchObject({ code: errorCodes.ROUTE_NOT_FOUND });

      expect(getHydrationState(router2)).toBeNull();

      router2.stop();
    });

    it("returns null for a plain start() with no hydrateRouter", async () => {
      const { seen, remove } = observeStarts(router);

      await router.start("/home");

      expect(seen).toStrictEqual([null]);

      remove();
    });

    it("a later start() after hydrateRouter sees null", async () => {
      const { seen, remove } = observeStarts(router);

      await hydrateRouter(router, { path: "/users/list" });
      router.stop();
      await router.start("/home");

      expect(seen).toHaveLength(2);
      expect(seen[0]).toMatchObject({ path: "/users/list" });
      expect(seen[1]).toBeNull();

      remove();
    });

    it("is keyed by router — another router sees nothing while this one hydrates", async () => {
      const other = createTestRouter();
      const seenByOther: (SerializedRouterState | null)[] = [];

      const remove = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          seenByOther.push(getHydrationState(other));

          return next(path);
        },
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      // The interceptor ran exactly once, so the null is an answer rather
      // than an unread slot.
      expect(seenByOther).toStrictEqual([null]);

      remove();
      other.stop();
    });

    it("a nested hydrateRouter restores the outer payload, not null, when it settles", async () => {
      const seenAfterInner: (SerializedRouterState | null)[] = [];
      let innerOutcome = "not run";
      let nested = false;

      const remove = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          if (!nested) {
            nested = true;

            await hydrateRouter(router, { path: "/users/list" }).then(
              () => {
                innerOutcome = "resolved";
              },
              () => {
                innerOutcome = "rejected";
              },
            );
            seenAfterInner.push(getHydrationState(router));
          }

          return next(path);
        },
      );

      const outer = await hydrateRouter(
        router,
        serializeRouterState(serverState),
      ).then(
        (state) => state.name,
        (error: unknown) => `rejected: ${(error as Error).message}`,
      );

      expect({ innerOutcome, outer, seenAfterInner }).toStrictEqual({
        innerOutcome: "rejected",
        outer: "users.view",
        seenAfterInner: [expect.objectContaining({ path: "/users/view/42" })],
      });

      remove();
    });

    it("refuses a Proxy over a router instead of depositing under a key no plugin reads", async () => {
      // A plugin reads the scratchpad with the router it was installed on, so
      // a payload keyed by a wrapper would be lost without a word. The refusal
      // is core's #2294 message, reached through a public door.
      await expect(
        hydrateRouter(new Proxy(router, {}), { path: "/users/list" }),
      ).rejects.toThrow(/This IS a router, but not one this copy/);

      // CONTROL: the same call with the router itself hydrates.
      await expect(
        hydrateRouter(router, { path: "/users/list" }),
      ).resolves.toMatchObject({ name: "users.list" });
    });
  });

  it("publishes a read door for the scratchpad and no write door (#2361)", async () => {
    // Applications must not pre-populate the scratchpad to skip a loader
    // outside hydration; only `hydrateRouter` writes it. Type-only exports do
    // not exist at runtime, so this list is the whole runtime surface.
    expect(
      Object.keys(await import("@real-router/ssr-utils")).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toStrictEqual([
      "createRequestScope",
      "getHydrationState",
      "getStaticPaths",
      "hydrateRouter",
      "serializeRouterState",
      "serializeState",
    ]);
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

      let observed: SerializedRouterState | null = null;

      const removeInterceptor = getPluginApi(router).addInterceptor(
        "start",
        async (next, path) => {
          observed = getHydrationState(router);

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
