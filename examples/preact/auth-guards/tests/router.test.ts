import { createRouter, errorCodes } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import { publicRoutes, privateRoutes } from "../src/routes";

import type { Router } from "@real-router/core";
import type { AppDependencies } from "../src/types";

let router: Router<AppDependencies>;

afterEach(() => {
  router.stop();
});

describe("forwardTo redirect", () => {
  it("redirects / to dashboard when using private routes", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
    });
    await router.start("/");

    expect(router.getState()?.name).toBe("dashboard");
    expect(router.getState()?.path).toBe("/dashboard");
  });

  it("stays on / when using public routes (no forwardTo)", async () => {
    router = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
    });
    await router.start("/");

    expect(router.getState()?.name).toBe("home");
    expect(router.getState()?.path).toBe("/");
  });
});

describe("Login → route tree swap", () => {
  it("swaps from public to private routes and navigates to dashboard", async () => {
    router = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/");

    expect(router.getState()?.name).toBe("home");

    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(privateRoutes);
    getDependenciesApi(router).set("abilities", defineAbilities("admin"));

    const state = await router.navigate("dashboard");

    expect(state.name).toBe("dashboard");
  });
});

describe("Logout → route tree swap back", () => {
  it("swaps from private back to public routes", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(router).set("abilities", defineAbilities("admin"));
    await router.start("/dashboard");

    expect(router.getState()?.name).toBe("dashboard");

    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(publicRoutes);
    getDependenciesApi(router).set("abilities", []);

    const state = await router.navigate("home");

    expect(state.name).toBe("home");
    expect(state.path).toBe("/");
  });
});

describe("404 after route tree change", () => {
  it("navigating to removed route yields NOT_FOUND", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(router).set("abilities", defineAbilities("admin"));
    await router.start("/dashboard");

    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(publicRoutes);

    await expect(router.navigate("dashboard")).rejects.toMatchObject({
      code: errorCodes.ROUTE_NOT_FOUND,
    });
  });
});

describe("RBAC — same guard, different roles", () => {
  it("alice (admin) can access admin page", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(router).set("abilities", defineAbilities("admin"));
    await router.start("/dashboard");

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
  });

  it("bob (editor) cannot access admin page", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    getDependenciesApi(router).set("abilities", defineAbilities("editor"));
    await router.start("/dashboard");

    await expect(router.navigate("admin")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
  });
});

describe("canDeactivate — settings with unsaved changes", () => {
  it("blocks leaving settings when unsaved and confirm=false", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/settings");

    store.set("settings:unsaved", true);
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    await expect(router.navigate("dashboard")).rejects.toMatchObject({
      code: errorCodes.CANNOT_DEACTIVATE,
    });
    expect(router.getState()?.name).toBe("settings");
  });

  it("allows leaving when confirm=true", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await router.start("/settings");

    store.set("settings:unsaved", true);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    const state = await router.navigate("dashboard");

    expect(state.name).toBe("dashboard");
  });
});
