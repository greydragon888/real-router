import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core";

import { createLifecycleTestRouter, errorCodes, type Router } from "./setup";

let router: Router;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/forceDeactivate", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should force deactivation if transition option is set", async () => {
    lifecycle.addDeactivateGuard("orders.view", false);

    await router.navigate("orders.view", { id: "1" });

    try {
      await router.navigate("home");
    } catch (error: any) {
      expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    }

    await router.navigate("home", {}, { forceDeactivate: true });

    expect(router.getState()?.name).toStrictEqual("home");
  });
});
