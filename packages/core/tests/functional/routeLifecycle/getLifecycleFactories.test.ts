import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createLifecycleTestRouter, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/getLifecycleFactories", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return registered canDeactivate and canActivate factories", () => {
    const canDeactivate = () => () => true;
    const canActivate = () => () => true;

    router.canDeactivate("users", canDeactivate);
    router.canActivate("admin", canActivate);

    const [deactivateFactories, activateFactories] =
      router.getLifecycleFactories();

    expect(deactivateFactories.users).toBe(canDeactivate);
    expect(activateFactories.admin).toBe(canActivate);
  });
});
