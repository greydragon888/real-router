import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createLifecycleTestRouter, errorCodes, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/forceDeactivate", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should force deactivation if transition option is set", async () => {
    router.addDeactivateGuard("orders.view", false);

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
