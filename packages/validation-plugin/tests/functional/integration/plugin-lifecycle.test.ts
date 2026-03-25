import { createRouter, RouterError } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { describe, it, expect, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

let router: Router;

afterEach(() => {
  router?.stop();
});

describe("validationPlugin — lifecycle integration", () => {
  it("router without plugin works normally — start resolves", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    const state = await router.start("/home");

    expect(state.name).toBe("home");
  });

  it("router with plugin active — navigate valid route succeeds", async () => {
    router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(validationPlugin());
    await router.start("/home");

    await expect(router.navigate("about")).resolves.toBeDefined();
  });

  it("plugin catches bad navigate args — throws TypeError for number", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const raw = router as unknown as { navigate: (n: unknown) => unknown };

    expect(() => raw.navigate(123)).toThrow(TypeError);
  });

  it("throws VALIDATION_PLUGIN_AFTER_START when registered after start", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    await router.start("/home");

    expect(() => router.usePlugin(validationPlugin())).toThrow(RouterError);
    expect(() => router.usePlugin(validationPlugin())).toThrow(
      "validation-plugin must be registered before router.start()",
    );
  });

  it("teardown clears validator — unsubscribe sets ctx.validator to null", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    const ctx = getInternals(router);
    const unsubscribe = router.usePlugin(validationPlugin());

    await router.start("/home");

    expect(ctx.validator).not.toBeNull();

    unsubscribe();

    expect(ctx.validator).toBeNull();
  });

  it("teardown clears validator — validation no longer active after unsubscribe", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    const unsubscribe = router.usePlugin(validationPlugin());

    await router.start("/home");

    const rawBefore = router as unknown as {
      navigate: (n: unknown) => unknown;
    };

    expect(() => rawBefore.navigate(123)).toThrow(TypeError);

    unsubscribe();

    const rawAfter = router as unknown as { navigate: (n: unknown) => unknown };

    expect(() => rawAfter.navigate(123)).not.toThrow();
  });

  it("retrospective rollback — duplicate routes cause ctx.validator to be null after throw", () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "home", path: "/home-dup" },
    ]);
    const ctx = getInternals(router);

    expect(() => router.usePlugin(validationPlugin())).toThrow();
    expect(ctx.validator).toBeNull();
  });

  it("throwIfInternalRoute wrapper — remove internal route throws Error", async () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const routes = getRoutesApi(router);
    const raw = routes as unknown as { remove: (n: unknown) => void };

    expect(() => {
      raw.remove("@@internal");
    }).toThrow();
  });

  it("throwIfInternalRoute wrapper — update internal route throws Error", async () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const routes = getRoutesApi(router);

    expect(() => {
      routes.update("@@internal", {});
    }).toThrow();
  });

  it("validateLimitValue wrapper — valid value does not throw", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const ctx = getInternals(router);

    expect(() =>
      ctx.validator?.options.validateLimitValue("maxPlugins", 5),
    ).not.toThrow();
  });

  it("validateLimitValue wrapper — negative value throws RangeError", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const ctx = getInternals(router);

    expect(() =>
      ctx.validator?.options.validateLimitValue("maxPlugins", -1),
    ).toThrow(RangeError);
  });

  it("validateLimits wrapper — valid limits object does not throw", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const ctx = getInternals(router);

    expect(() =>
      ctx.validator?.options.validateLimits({ maxPlugins: 5 }),
    ).not.toThrow();
  });

  it("validateLimits wrapper — invalid limits (string) throws TypeError", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const ctx = getInternals(router);

    expect(() => ctx.validator?.options.validateLimits("invalid")).toThrow(
      TypeError,
    );
  });

  it("validateNotRegistering wrapper — does not throw when not registering", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const ctx = getInternals(router);

    expect(() =>
      ctx.validator?.lifecycle.validateNotRegistering(
        "home",
        [],
        "canActivate",
      ),
    ).not.toThrow();
  });

  it("validateDependencyExists — missing dependency throws ReferenceError", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const ctx = getInternals(router);

    expect(() => {
      if (!ctx.validator) {
        throw new Error("validator not set");
      }

      ctx.validator.dependencies.validateDependencyExists("missing-dep", {
        dependencies: {},
      });
    }).toThrow(ReferenceError);
  });

  it("areStatesEqual with valid boolean ignoreQP — covers FALSE branch of !isBoolean check", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    router.usePlugin(validationPlugin());
    await router.start("/home");
    const state = router.getState()!;

    expect(() => router.areStatesEqual(state, state, false)).not.toThrow();
    expect(() => router.areStatesEqual(state, state, true)).not.toThrow();
  });
});
