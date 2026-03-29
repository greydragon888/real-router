import { createRouter, errorCodes } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { baseRoutes, analyticsRoute, adminRoutes } from "../src/routes";

import type { Router } from "@real-router/core";

let router: Router;

afterEach(() => {
  router.stop();
});

describe("add() — single flat route", () => {
  it("adds analytics route at runtime and navigates to it", async () => {
    router = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const routesApi = getRoutesApi(router);

    routesApi.add(analyticsRoute);

    const state = await router.navigate("analytics");

    expect(state.name).toBe("analytics");
    expect(state.path).toBe("/analytics");
  });
});

describe("add() — route with nested children", () => {
  it("adds admin routes and navigates to nested child", async () => {
    router = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const routesApi = getRoutesApi(router);

    routesApi.add(adminRoutes);

    const state = await router.navigate("admin.users");

    expect(state.name).toBe("admin.users");
    expect(state.path).toBe("/admin/users");
  });

  it("navigates to admin parent", async () => {
    router = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    getRoutesApi(router).add(adminRoutes);

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
    expect(state.path).toBe("/admin");
  });
});

describe("remove() — removing a route", () => {
  it("removing analytics makes it unreachable", async () => {
    router = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const routesApi = getRoutesApi(router);

    routesApi.add(analyticsRoute);
    await router.navigate("analytics");
    expect(router.getState()?.name).toBe("analytics");

    await router.navigate("home");
    routesApi.remove("analytics");

    await expect(router.navigate("analytics")).rejects.toMatchObject({
      code: errorCodes.ROUTE_NOT_FOUND,
    });
  });

  it("removing parent removes all children too", async () => {
    router = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const routesApi = getRoutesApi(router);

    routesApi.add(adminRoutes);
    await router.navigate("admin.users");
    expect(router.getState()?.name).toBe("admin.users");

    await router.navigate("home");
    routesApi.remove("admin");

    await expect(router.navigate("admin.users")).rejects.toMatchObject({
      code: errorCodes.ROUTE_NOT_FOUND,
    });
    await expect(router.navigate("admin")).rejects.toMatchObject({
      code: errorCodes.ROUTE_NOT_FOUND,
    });
  });
});

describe("remove active route — redirect first", () => {
  it("navigates home before removing the active route", async () => {
    router = createRouter(baseRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    const routesApi = getRoutesApi(router);

    routesApi.add(analyticsRoute);
    await router.navigate("analytics");

    await router.navigate("home");
    routesApi.remove("analytics");

    expect(router.getState()?.name).toBe("home");
  });
});
