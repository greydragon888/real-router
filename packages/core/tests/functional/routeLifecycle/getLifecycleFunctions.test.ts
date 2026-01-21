import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { createLifecycleTestRouter, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/getLifecycleFunctions", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return registered canDeactivate and canActivate functions", () => {
    router.canDeactivate("orders.view", true);
    router.canActivate("admin", false);

    const [deactivateFns, activateFns] = router.getLifecycleFunctions();

    expect(typeof deactivateFns.get("orders.view")).toBe("function");

    expect(typeof activateFns.get("admin")).toBe("function");
  });

  it("should return empty Maps when no lifecycle handlers are registered", () => {
    const cleanRouter = createRouter([]);

    cleanRouter.start();

    const [deactivateFns, activateFns] = cleanRouter.getLifecycleFunctions();

    expect(deactivateFns.size).toBe(0);
    expect(activateFns.size).toBe(0);
  });
});
