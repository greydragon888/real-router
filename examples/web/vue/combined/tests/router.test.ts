import { createRouter, errorCodes } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { describe, afterEach, it, expect } from "vitest";

import { defineAbilities } from "../../../shared/abilities";
import { store } from "../../../shared/store";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { privateRoutes, publicRoutes } from "../src/routes";

import type { AppDependencies } from "../src/types";
import type { Router } from "@real-router/core";

// =========================================================================
// a) Setup/teardown boilerplate
// =========================================================================
describe("Setup/teardown boilerplate", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  it("creates a router, starts it, and verifies the initial state", async () => {
    router = createRouter([{ name: "home", path: "/" }], {
      defaultRoute: "home",
    });

    await router.start("/");

    expect(router.isActive()).toBe(true);
    expect(router.getState()?.name).toBe("home");
  });
});

// =========================================================================
// b) Guard factory + DI — adminGuard
// =========================================================================
describe("Guard factory + DI — adminGuard", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
  });

  it("blocks navigation to admin without required abilities", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    getDependenciesApi(router).set("abilities", []);
    await router.start("/dashboard");

    await expect(router.navigate("admin")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
    expect(router.getState()?.name).toBe("dashboard");
  });

  it("allows navigation to admin with admin abilities", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    getDependenciesApi(router).set("abilities", defineAbilities("admin"));
    await router.start("/dashboard");

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
  });
});

// =========================================================================
// c) Async guard + timers — checkoutGuard
// =========================================================================
describe("Async guard + timers — checkoutGuard", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
  });

  it("completes navigation after the 600ms guard delay", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    await router.start("/dashboard");

    vi.useFakeTimers();

    const navPromise = router.navigate("checkout");

    await vi.advanceTimersByTimeAsync(600);

    const state = await navPromise;

    expect(state.name).toBe("checkout");
  });
});

// =========================================================================
// d) Async guard rejection
// =========================================================================
describe("Async guard rejection", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  it("rejects navigation when canActivate returns false asynchronously", async () => {
    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "blocked",
          path: "/blocked",
          canActivate: () => () => Promise.resolve(false),
        },
      ],
      { defaultRoute: "home" },
    );
    await router.start("/");

    await expect(router.navigate("blocked")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
    expect(router.getState()?.name).toBe("home");
  });
});

// =========================================================================
// e) canDeactivate + shared state — settingsDeactivateGuard
// =========================================================================
describe("canDeactivate + shared state — settingsDeactivateGuard", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
  });

  it("blocks navigation away when unsaved changes and user cancels confirm", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    await router.start("/settings");

    store.set("settings:unsaved", true);
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    await expect(router.navigate("dashboard")).rejects.toMatchObject({
      code: errorCodes.CANNOT_DEACTIVATE,
    });
    expect(router.getState()?.name).toBe("settings");
  });

  it("allows navigation when user confirms leaving", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    await router.start("/settings");

    store.set("settings:unsaved", true);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    const state = await router.navigate("dashboard");

    expect(state.name).toBe("dashboard");
  });
});

// =========================================================================
// f) Custom plugin — lifecyclePluginFactory
// =========================================================================
describe("Custom plugin — lifecyclePluginFactory", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
  });

  it("loads data into the store after navigation", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    router.usePlugin(lifecyclePluginFactory());
    await router.start("/dashboard");

    vi.useFakeTimers();

    await router.navigate("products.list");

    expect(store.get("products.list:loading")).toBe(true);

    await vi.advanceTimersByTimeAsync(300);

    expect(store.get("products.list:loading")).toBe(false);
    expect(store.get("products.list")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Laptop" }),
        expect.objectContaining({ name: "Keyboard" }),
        expect.objectContaining({ name: "Monitor" }),
      ]),
    );
  });
});

// =========================================================================
// g) State shape assertion
// =========================================================================
describe("State shape assertion", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
  });

  it("produces correct state for products.detail with params", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    await router.start("/dashboard");

    const state = await router.navigate("products.detail", { id: "42" });

    expect(state).toMatchObject({
      name: "products.detail",
      params: { id: "42" },
      path: "/products/42",
    });
  });
});

// =========================================================================
// h) Route tree swap
// =========================================================================
describe("Route tree swap", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
  });

  it("swaps from public to private routes at runtime", async () => {
    router = createRouter<AppDependencies>(publicRoutes, {
      defaultRoute: "home",
    });
    await router.start("/");

    expect(router.getState()?.name).toBe("home");

    await router.navigate("login");

    expect(router.getState()?.name).toBe("login");

    // Swap route tree: clear + add (replaceRoutes via getRoutesApi().replace() is also available)
    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(privateRoutes);

    const state = await router.navigate("dashboard");

    expect(state.name).toBe("dashboard");
  });
});

// =========================================================================
// i) AbortSignal cancellation
// =========================================================================
describe("AbortSignal cancellation", () => {
  let router: Router<AppDependencies>;

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
  });

  it("cancels in-flight navigation via AbortController", async () => {
    router = createRouter<AppDependencies>(privateRoutes, {
      defaultRoute: "dashboard",
    });
    await router.start("/dashboard");

    vi.useFakeTimers();

    const controller = new AbortController();
    const navPromise = router.navigate(
      "checkout",
      {},
      {
        signal: controller.signal,
      },
    );

    // Abort before the 600ms guard timer resolves
    controller.abort();

    await expect(navPromise).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect(router.getState()?.name).toBe("dashboard");
  });
});
