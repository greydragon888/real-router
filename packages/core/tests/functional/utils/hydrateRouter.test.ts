import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { errorCodes } from "@real-router/core";

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

  it("propagates ROUTE_NOT_FOUND when client cannot match the path", async () => {
    const router2 = createTestRouter({ allowNotFound: false });

    await expect(
      hydrateRouter(router2, { path: "/nonexistent" }),
    ).rejects.toMatchObject({ code: errorCodes.ROUTE_NOT_FOUND });

    router2.stop();
  });
});
