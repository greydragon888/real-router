import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { hydrateRouter } from "../../../src/utils/hydrateRouter";
import { serializeRouterState } from "../../../src/utils/serializeRouterState";
import { createTestRouter } from "../../helpers";

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
});
