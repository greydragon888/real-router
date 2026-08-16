import { createRouter } from "@real-router/core";
import { describe, it, expect, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

let router: Router;

describe("createRouter — validation (with validationPlugin)", () => {
  afterEach(() => {
    router.stop();
  });

  describe("with routes", () => {
    it("rejects duplicate route names at construction — core parity, plugin-independent (#1351)", () => {
      // #1351 closed the constructor gap: bare core now rejects a duplicate
      // sibling name at createRouter() time (parity with add()/replace()), so
      // the plugin's retrospective pass never sees it — the throw is core's.
      router = createRouter([{ name: "home", path: "/home" }]);

      expect(() =>
        createRouter([
          { name: "home", path: "/home" },
          { name: "home", path: "/duplicate" },
        ]),
      ).toThrow(/Duplicate route "home" in batch/);
    });

    it("a flat dotted route name never reaches the plugin — bare core refuses it first (#1194 / #1763)", () => {
      // The retrospective pass still carries the dot rule (#1194 put it there,
      // because add()/replace() rejected the spelling while the constructor did
      // not). It is unreachable from here now: #1763 wired the same rule into
      // bare core's always-on registration path, so `createRouter` throws before
      // any plugin exists — the message being identical is the point of that
      // backstop, and this test pins WHERE it comes from.
      expect(() =>
        createRouter([{ name: "users.view", path: "/:id" }]),
      ).toThrow(/cannot contain dots/);
    });

    it("should not throw for valid unique routes", () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ]);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("should not throw for empty routes", () => {
      router = createRouter([]);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("should not throw for routes with children", () => {
      router = createRouter([
        {
          name: "users",
          path: "/users",
          children: [
            { name: "profile", path: "/:id" },
            { name: "list", path: "/list" },
          ],
        },
      ]);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });
  });
});
