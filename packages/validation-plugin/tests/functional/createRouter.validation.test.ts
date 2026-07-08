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
    it("should throw if route names are duplicated", () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "home", path: "/duplicate" },
      ]);

      expect(() => router.usePlugin(validationPlugin())).toThrow();
    });

    it("should throw for a flat dotted route name — constructor symmetry with add()/replace() (#1194)", () => {
      // add()/replace() reject a dotted route name; the constructor's initial
      // routes must be rejected on plugin registration too, else a validation-ON
      // app still gets the name-vs-URL split-brain via createRouter([...]).
      router = createRouter([{ name: "users.view", path: "/:id" }]);

      expect(() => router.usePlugin(validationPlugin())).toThrow(
        /cannot contain dots/,
      );
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
