import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
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

  it("duplicate route names caught at usePlugin — throws with duplicate message", () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "home", path: "/home2" },
    ]);

    expect(() => router.usePlugin(validationPlugin())).toThrow(/duplicate/i);
  });

  it("nested duplicate route names caught at usePlugin", () => {
    router = createRouter([
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
    ]);

    expect(() => router.usePlugin(validationPlugin())).toThrow(/duplicate/i);
  });

  it("rollback confirmed — after retrospective failure ctx.validator is null", () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "home", path: "/dup" },
    ]);
    const ctx = getInternals(router);

    expect(() => router.usePlugin(validationPlugin())).toThrow();
    expect(ctx.validator).toBeNull();
  });

  it("router with decoders passes retrospective", () => {
    router = createRouter([
      {
        name: "product",
        path: "/product/:id",
        decodeParams: (params) => ({ id: Number(params.id) }),
        encodeParams: (params) => ({ ...params }),
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
      { api: "http://example.com" },
    );

    expect(() => r.usePlugin(validationPlugin())).not.toThrow();

    r.stop();
  });

  it("dependency count at limit triggers RangeError on usePlugin", () => {
    const deps: Record<string, number> = {};

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

      await expect(router.navigateToDefault()).rejects.toThrow(
        /defaultRoute resolved to non-existent route: "ghost"/,
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
