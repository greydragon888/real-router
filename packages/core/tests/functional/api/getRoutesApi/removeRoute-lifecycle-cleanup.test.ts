import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

/**
 * removeRoute must clear the removed route's (and descendants') lifecycle
 * guards via clearRouteConfigurations' `shouldClear` predicate, WITHOUT
 * touching sibling guards. The existing removeRoute suite covers tree/forward
 * cleanup but not lifecycle-guard cleanup, leaving the shouldClear loop
 * (conditionals + block removals) alive.
 */
let router: Router;

describe("removeRoute — lifecycle guard cleanup (shouldClear)", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("clears the removed route's guard but preserves a sibling's", async () => {
    const routes = getRoutesApi(router);
    const lifecycle = getLifecycleApi(router);

    routes.add({ name: "keep", path: "/keep" });
    routes.add({ name: "temp", path: "/temp" });
    lifecycle.addActivateGuard("keep", () => () => false); // blocks navigation
    lifecycle.addActivateGuard("temp", () => () => false); // blocks navigation

    routes.remove("temp"); // clears temp's guard; keep's must survive

    await router.start("/home");

    // sibling guard preserved → "keep" still blocked
    // (kills shouldClear → true / over-clearing all guards)
    await expect(router.navigate("keep")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });

    // temp re-added without a guard → navigates freely
    // (kills shouldClear → false / not-clearing + the clear-loop block removals)
    routes.add({ name: "temp", path: "/temp" });

    const state = await router.navigate("temp");

    expect(state.name).toBe("temp");
  });

  it("clears descendant guards when a parent route is removed (startsWith branch)", async () => {
    const routes = getRoutesApi(router);
    const lifecycle = getLifecycleApi(router);

    routes.add({
      name: "parent",
      path: "/parent",
      children: [{ name: "child", path: "/child" }],
    });
    lifecycle.addActivateGuard("parent.child", () => () => false);

    routes.remove("parent"); // shouldClear matches "parent.child" via startsWith

    routes.add({
      name: "parent",
      path: "/parent",
      children: [{ name: "child", path: "/child" }],
    });

    await router.start("/home");

    const state = await router.navigate("parent.child");

    expect(state.name).toBe("parent.child");
  });

  it("clears deactivate guards on removal too", async () => {
    const routes = getRoutesApi(router);
    const lifecycle = getLifecycleApi(router);

    routes.add({ name: "guarded", path: "/guarded" });
    lifecycle.addDeactivateGuard("guarded", () => () => false); // blocks leaving

    routes.remove("guarded");
    routes.add({ name: "guarded", path: "/guarded" }); // re-add clean

    await router.start("/home");
    await router.navigate("guarded");

    // deactivate guard was cleared → can leave "guarded"
    const state = await router.navigate("users");

    expect(state.name).toBe("users");
  });
});
