import { createRouter, RouterError } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

describe("validationPlugin — lifecycle integration", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

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
      "[validation-plugin] must be registered before router.start()",
    );
  });

  it("teardown releases the validator — its doors answer as bare core, and the router takes a new install", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    const unsubscribe = router.usePlugin(validationPlugin());
    // `getDependency` consults the validator itself rather than a registered
    // check, so it answers for the slot the teardown releases.
    const readMissing = () =>
      getDependenciesApi(router).get("missing-dep" as never);

    await router.start("/home");

    expect(readMissing).toThrow(ReferenceError);

    unsubscribe();

    expect(readMissing()).toBeUndefined();

    // A held slot refuses the next install as VALIDATION_PLUGIN_ALREADY_INSTALLED.
    router.stop();

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    expect(readMissing).toThrow(ReferenceError);
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

  it("retrospective rollback — a retrospective failure leaves no validation active (#1351 repoint)", () => {
    router = createRouter([
      // A dangling `forwardTo` is a RETROSPECTIVE-only failure: bare core
      // accepts it, the plugin rejects it on registration — the rollback under
      // test is about the failure, not about which rule produced it.
      { name: "a", path: "/a", forwardTo: "ghost" },
    ]);

    expect(() => router.usePlugin(validationPlugin())).toThrow(/ghost/);

    // `getDependency` consults the validator itself, so it answers for the slot
    // the failed install wrote and must have released.
    expect(
      getDependenciesApi(router).get("missing-dep" as never),
    ).toBeUndefined();

    // Repaired, the router takes the install: a slot left held would refuse it
    // as VALIDATION_PLUGIN_ALREADY_INSTALLED.
    getRoutesApi(router).add({ name: "ghost", path: "/ghost" });

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });

  it("throwIfInternalRoute wrapper — remove internal route throws Error", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const routes = getRoutesApi(router);
    const raw = routes as unknown as { remove: (n: unknown) => void };

    expect(() => {
      raw.remove("@@internal");
    }).toThrow();
  });

  it("throwIfInternalRoute wrapper — update internal route throws Error", () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    const routes = getRoutesApi(router);

    expect(() => {
      routes.update("@@internal", {});
    }).toThrow();
  });

  it("validateDependencyExists — getDependency refuses a name nothing resolved, and only that", () => {
    const r = createRouter<{ "present-dep": number }>(
      [{ name: "home", path: "/home" }],
      {},
      { "present-dep": 0 },
    );

    r.usePlugin(validationPlugin());

    const deps = getDependenciesApi(r);

    // ⚑ The VALUE core read decides, not the store (#2382): `undefined` is
    // what `readDependency` hands back for a name nothing resolved.
    expect(() => deps.get("missing-dep" as never)).toThrow(ReferenceError);

    // Control: a name that DID resolve passes with a falsy value, so the arm
    // above is not green for a check that refuses every falsy answer.
    expect(deps.get("present-dep")).toBe(0);

    r.stop();
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

  describe("duplicate plugin detection (#726)", () => {
    it("usePlugin throws when the same factory is registered twice", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: "home",
      });
      router.usePlugin(validationPlugin());

      const myPlugin = () => ({});

      router.usePlugin(myPlugin);

      expect(() => router.usePlugin(myPlugin)).toThrow(/already registered/i);
    });

    it("usePlugin does not throw for distinct factories", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: "home",
      });
      router.usePlugin(validationPlugin());

      expect(() => {
        router.usePlugin(() => ({}));
        router.usePlugin(() => ({}));
      }).not.toThrow();
    });
  });
});
