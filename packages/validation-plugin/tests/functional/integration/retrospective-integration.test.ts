import { createRouter } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

describe("retrospective validation — triggered at usePlugin() time", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  it("valid routes with forwardTo pass retrospective", () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "about", path: "/about" },
      { name: "legacy", path: "/old", forwardTo: "home" },
    ]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });

  it("valid nested routes pass retrospective", () => {
    router = createRouter([
      { name: "home", path: "/home" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });

  it("duplicate route names rejected at construction — core parity, pre-plugin (#1351)", () => {
    router = createRouter([{ name: "home", path: "/home" }]);

    expect(() =>
      createRouter([
        { name: "home", path: "/home" },
        { name: "home", path: "/home2" },
      ]),
    ).toThrow(/Duplicate route "home" in batch/);
  });

  it("nested duplicate route names rejected at construction — core parity (#1351)", () => {
    router = createRouter([{ name: "home", path: "/home" }]);

    expect(() =>
      createRouter([
        {
          name: "section",
          path: "/section",
          children: [{ name: "item", path: "/item" }],
        },
        {
          name: "section",
          path: "/section2",
          children: [{ name: "item", path: "/item2" }],
        },
      ]),
    ).toThrow(/Duplicate route "section" in batch/);
  });

  it("rollback confirmed — after a retrospective failure no validation is active", () => {
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

  it("router with decoders passes retrospective", () => {
    router = createRouter([
      {
        name: "product",
        path: "/product/:id",
        decodeParams: ({ params, search }) => ({
          params: { id: Number(params.id) },
          search,
        }),
        encodeParams: ({ params, search }) => ({
          params: { ...params },
          search,
        }),
      },
    ]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });

  it("valid forwardTo chain passes retrospective", () => {
    router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b", forwardTo: "a" },
      { name: "c", path: "/c", forwardTo: "b" },
    ]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });

  it("existing dependencies pass retrospective", () => {
    const r = createRouter<{ api: string }>(
      [{ name: "home", path: "/home" }],
      {},
      { api: "https://example.com" },
    );

    expect(() => r.usePlugin(validationPlugin())).not.toThrow();

    r.stop();
  });

  it("dependency count over limit triggers RangeError on usePlugin", () => {
    const deps: Record<string, number> = {};

    // 5 deps > maxDependencies 3 — strictly over the limit (#1225: an at-limit
    // store is legal, so the throw case here is over-limit).
    for (let i = 0; i < 5; i++) {
      deps[`dep${i}`] = i;
    }

    const r = createRouter<Record<string, number>>(
      [],
      { limits: { maxDependencies: 3 } },
      deps,
    );

    expect(() => r.usePlugin(validationPlugin())).toThrow(RangeError);

    r.stop();
  });

  describe("defaultRoute validation (#471 case 5)", () => {
    it("static defaultRoute pointing to missing route throws at usePlugin", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: "missing",
      });

      expect(() => router.usePlugin(validationPlugin())).toThrow(
        /defaultRoute resolved to non-existent route: "missing"/,
      );
    });

    it("static defaultRoute pointing to existing route passes", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: "home",
      });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("empty static defaultRoute passes (means not configured)", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: "",
      });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("callback defaultRoute returning missing route surfaces on navigateToDefault", async () => {
      router = createRouter(
        [
          { name: "home", path: "/home" },
          { name: "about", path: "/about" },
        ],
        {
          defaultRoute: () => "ghost",
        },
      );

      router.usePlugin(validationPlugin());

      await router.start("/home");

      // The door, not just the body: this path IS reached by a call the caller
      // made, and it arrives as a rejection rather than a throw.
      await expect(router.navigateToDefault()).rejects.toThrow(
        /^\[router\.navigateToDefault\] defaultRoute callback resolved to non-existent route: "ghost"$/u,
      );
    });

    it("callback defaultRoute returning existing route works", async () => {
      router = createRouter(
        [
          { name: "home", path: "/home" },
          { name: "about", path: "/about" },
        ],
        {
          defaultRoute: () => "about",
        },
      );

      router.usePlugin(validationPlugin());

      await router.start("/home");

      const state = await router.navigateToDefault();

      expect(state.name).toBe("about");
    });

    it("callback defaultRoute is not probed at usePlugin time", () => {
      let callCount = 0;

      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: () => {
          callCount++;

          return "home";
        },
      });

      router.usePlugin(validationPlugin());

      expect(callCount).toBe(0);
    });
  });

  describe("limits cross-field (#471 case 1)", () => {
    it("warnListeners exceeding maxListeners throws RangeError at usePlugin", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        limits: { warnListeners: 5000, maxListeners: 100 },
      });

      expect(() => router.usePlugin(validationPlugin())).toThrow(RangeError);
      expect(() => router.usePlugin(validationPlugin())).toThrow(
        /warning channel would be unreachable/,
      );
    });

    it("warnListeners <= maxListeners passes", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        limits: { warnListeners: 50, maxListeners: 100 },
      });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });
  });
});
