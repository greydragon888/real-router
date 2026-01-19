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

  it("should force deactivation if transition option is set", () => {
    router.canDeactivate("orders.view", false);

    router.navigate("orders.view", { id: "1" });

    router.navigate("home", (err) => {
      expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    });

    router.navigate("home", {}, { forceDeactivate: true });

    expect(router.getState()?.name).toStrictEqual("home");
  });
});
