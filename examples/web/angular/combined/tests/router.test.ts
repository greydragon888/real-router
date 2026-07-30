import { createRouter, errorCodes } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defineAbilities } from "../../../../shared/abilities";
import { store } from "../../../../shared/store";
import { privateRoutes, publicRoutes } from "../src/routes";

import type { AppDependencies } from "../src/types";
import type { Router } from "@real-router/core";

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

    await router.navigate("products");

    expect(store.get("products:loading")).toBe(true);

    await vi.advanceTimersByTimeAsync(300);

    expect(store.get("products:loading")).toBe(false);
    // eslint-disable-next-line vitest/prefer-strict-equal -- arrayContaining/objectContaining matchers require .toEqual
    expect(store.get("products")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Laptop" }),
        expect.objectContaining({ name: "Keyboard" }),
        expect.objectContaining({ name: "Monitor" }),
      ]),
    );
  });
});

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

    const routesApi = getRoutesApi(router);

    routesApi.clear();
    routesApi.add(privateRoutes);

    const state = await router.navigate("dashboard");

    expect(state.name).toBe("dashboard");
  });
});

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
      undefined,
      {
        signal: controller.signal,
      },
    );

    controller.abort();

    await expect(navPromise).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect(router.getState()?.name).toBe("dashboard");
  });
});
