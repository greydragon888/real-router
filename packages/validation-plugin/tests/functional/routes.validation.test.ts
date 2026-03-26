import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routes: RoutesApi;

describe("routes API validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "users", path: "/users" },
    ]);
    router.usePlugin(validationPlugin());
    routes = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("addRoute validation", () => {
    it("should throw when route name is empty string", () => {
      expect(() => {
        routes.add([{ name: "", path: "/empty" }]);
      }).toThrow();
    });

    it("should throw if route is not an object", () => {
      const raw = routes as unknown as { add: (r: unknown) => void };

      expect(() => {
        raw.add(["string"]);
      }).toThrow();
    });

    it("should throw if children is not an array", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad",
            children: "not-array" as never,
          },
        ]);
      }).toThrow();
    });

    it("should throw on duplicate route name", () => {
      expect(() => {
        routes.add([{ name: "home", path: "/home-duplicate" }]);
      }).toThrow();
    });

    it("should throw on duplicate path within same batch", () => {
      expect(() => {
        routes.add([
          { name: "path1", path: "/same-path" },
          { name: "path2", path: "/same-path" },
        ]);
      }).toThrow();
    });

    it("should throw when route name contains dots", () => {
      expect(() => {
        routes.add([{ name: "nested.route", path: "/nested" }]);
      }).toThrow(TypeError);
    });

    it("should include helpful error message for dot-notation", () => {
      expect(() => {
        routes.add([{ name: "a.b", path: "/ab" }]);
      }).toThrow(TypeError);
    });

    it("should throw when decodeParams is not a function", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad/:id",
            decodeParams: "not-a-function" as never,
          },
        ]);
      }).toThrow();
    });

    it("should throw when decodeParams is async", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad/:id",
            // @ts-expect-error testing async function (not allowed by type)
            decodeParams: async () => ({}),
          },
        ]);
      }).toThrow(TypeError);
    });

    it("should throw when encodeParams is not a function", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad/:id",
            encodeParams: 123 as never,
          },
        ]);
      }).toThrow();
    });

    it("should throw when encodeParams is async", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad/:id",
            // @ts-expect-error testing async function (not allowed by type)
            encodeParams: async () => ({}),
          },
        ]);
      }).toThrow(TypeError);
    });

    it("should throw when forwardTo callback is async", () => {
      expect(() => {
        routes.add([
          {
            name: "bad",
            path: "/bad",
            // @ts-expect-error testing async function (not allowed by type)
            forwardTo: async () => "home",
          },
        ]);
      }).toThrow(TypeError);
    });

    it("should throw on path with spaces", () => {
      expect(() => {
        routes.add([{ name: "bad", path: "/has space" }]);
      }).toThrow();
    });

    it("should throw on path with tabs", () => {
      expect(() => {
        routes.add([{ name: "bad", path: "/has\ttab" }]);
      }).toThrow();
    });

    it("should throw on path with newlines", () => {
      expect(() => {
        routes.add([{ name: "bad", path: "/has\nnewline" }]);
      }).toThrow();
    });

    it("should throw on class instance route", () => {
      class BadRoute {
        name = "bad";
        path = "/bad";
      }
      const raw = routes as unknown as { add: (r: unknown[]) => void };

      expect(() => {
        raw.add([new BadRoute()]);
      }).toThrow();
    });

    it("should throw if forwardTo target does not exist", () => {
      expect(() => {
        routes.add([{ name: "fwd", path: "/fwd", forwardTo: "nonexistent" }]);
      }).toThrow();
    });

    it("should throw if defaultParams is not an object", () => {
      expect(() => {
        routes.add([
          { name: "bad", path: "/bad", defaultParams: "string" as never },
        ]);
      }).toThrow();
    });

    it("should throw if path is not a string", () => {
      const raw = routes as unknown as { add: (r: unknown[]) => void };

      expect(() => {
        raw.add([{ name: "bad", path: 123 }]);
      }).toThrow();
    });

    it("should accept valid route definition", () => {
      expect(() => {
        routes.add([{ name: "new-route", path: "/new" }]);
      }).not.toThrow();
    });
  });

  describe("removeRoute validation", () => {
    it("should throw TypeError for invalid name (non-string)", () => {
      const raw = routes as unknown as { remove: (n: unknown) => void };

      expect(() => {
        raw.remove(null);
      }).toThrow();
      expect(() => {
        raw.remove(123);
      }).toThrow();
    });
  });

  describe("getRoute validation", () => {
    it("should throw TypeError for invalid name (leading dot)", () => {
      const raw = routes as unknown as { get: (n: unknown) => unknown };

      expect(() => raw.get(".home")).toThrow(TypeError);
    });

    it("should throw TypeError for invalid name (trailing dot)", () => {
      const raw = routes as unknown as { get: (n: unknown) => unknown };

      expect(() => raw.get("home.")).toThrow(TypeError);
    });

    it("should throw TypeError for non-string argument (number)", () => {
      const raw = routes as unknown as { get: (n: unknown) => unknown };

      expect(() => raw.get(123)).toThrow(TypeError);
    });

    it("should throw TypeError for non-string argument (null)", () => {
      const raw = routes as unknown as { get: (n: unknown) => unknown };

      expect(() => raw.get(null)).toThrow(TypeError);
    });

    it("should throw TypeError for whitespace-only string", () => {
      const raw = routes as unknown as { get: (n: unknown) => unknown };

      expect(() => raw.get("   ")).toThrow(TypeError);
    });
  });

  describe("hasRoute validation", () => {
    it("should throw TypeError for invalid name (leading dot)", () => {
      const raw = routes as unknown as { has: (n: unknown) => unknown };

      expect(() => raw.has(".home")).toThrow(TypeError);
    });

    it("should throw TypeError for non-string input (number)", () => {
      const raw = routes as unknown as { has: (n: unknown) => unknown };

      expect(() => raw.has(123)).toThrow(TypeError);
    });

    it("should throw TypeError for non-string input (null)", () => {
      const raw = routes as unknown as { has: (n: unknown) => unknown };

      expect(() => raw.has(null)).toThrow(TypeError);
    });

    it("should throw TypeError for whitespace-only input", () => {
      const raw = routes as unknown as { has: (n: unknown) => unknown };

      expect(() => raw.has("  ")).toThrow(TypeError);
    });
  });

  describe("updateRoute validation", () => {
    it("should throw for invalid update target", () => {
      const raw = routes as unknown as {
        update: (n: unknown, u: unknown) => void;
      };

      expect(() => {
        raw.update(null, {});
      }).toThrow();
    });

    it("should throw when encodeParams is async", () => {
      const raw = routes as unknown as {
        update: (n: string, u: unknown) => void;
      };

      expect(() => {
        raw.update("home", { encodeParams: async () => ({}) });
      }).toThrow(TypeError);

      expect(() => {
        raw.update("home", { encodeParams: async () => ({}) });
      }).toThrow(/cannot be an async function/);
    });

    it("should throw when decodeParams is async", () => {
      const raw = routes as unknown as {
        update: (n: string, u: unknown) => void;
      };

      expect(() => {
        raw.update("home", { decodeParams: async () => ({}) });
      }).toThrow(TypeError);
    });

    it("should throw when forwardTo callback is async", () => {
      const raw = routes as unknown as {
        update: (n: string, u: unknown) => void;
      };

      expect(() => {
        raw.update("home", { forwardTo: async () => "home" });
      }).toThrow(TypeError);
    });

    it("should throw when encodeParams has __awaiter in toString (transpiled async branch)", () => {
      const raw = routes as unknown as {
        update: (n: string, u: unknown) => void;
      };

      function transpiledEncoder() {
        return "__awaiter";
      }

      expect(() => {
        raw.update("home", { encodeParams: transpiledEncoder });
      }).toThrow(TypeError);

      expect(() => {
        raw.update("home", { encodeParams: transpiledEncoder });
      }).toThrow(/cannot be an async function/);
    });
  });

  describe("replaceRoutes validation", () => {
    it("should throw on duplicate names in replacement", () => {
      expect(() => {
        routes.replace([
          { name: "a", path: "/a" },
          { name: "a", path: "/a2" },
        ]);
      }).toThrow();
    });
  });
});

describe("routes.validateSetRootPathArgs", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
  });

  it("throws for non-string rootPath", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as { setRootPath: (p: unknown) => void };

    expect(() => {
      raw.setRootPath(42);
    }).toThrow(TypeError);
    expect(() => {
      raw.setRootPath(42);
    }).toThrow("rootPath must be a string");
  });

  it("accepts valid string rootPath", () => {
    const api = getPluginApi(router);

    expect(() => {
      api.setRootPath("/api");
    }).not.toThrow();
  });
});

describe("routes.guardRouteCallbacks", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("throws when canActivate is not a function", () => {
    const routes = getRoutesApi(router);

    expect(() => {
      routes.add([
        { name: "bad", path: "/bad", canActivate: "not-fn" as never },
      ]);
    }).toThrow(TypeError);
    expect(() => {
      routes.add([
        { name: "bad2", path: "/bad2", canActivate: "not-fn" as never },
      ]);
    }).toThrow("canActivate must be a function");
  });

  it("throws when canDeactivate is not a function", () => {
    const routes = getRoutesApi(router);

    expect(() => {
      routes.add([{ name: "bad3", path: "/bad3", canDeactivate: 42 as never }]);
    }).toThrow(TypeError);
    expect(() => {
      routes.add([{ name: "bad4", path: "/bad4", canDeactivate: 42 as never }]);
    }).toThrow("canDeactivate must be a function");
  });
});

describe("routes.guardNoAsyncCallbacks", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("throws when decodeParams is async", () => {
    const routes = getRoutesApi(router);

    const asyncFn = async (p: Record<string, unknown>) => p;

    expect(() => {
      routes.add([
        { name: "bad", path: "/bad/:id", decodeParams: asyncFn as never },
      ]);
    }).toThrow(TypeError);
    expect(() => {
      routes.add([
        { name: "bad2", path: "/bad2/:id", decodeParams: asyncFn as never },
      ]);
    }).toThrow("decodeParams cannot be async");
  });

  it("throws when encodeParams is async", () => {
    const routes = getRoutesApi(router);

    const asyncFn = async (p: Record<string, unknown>) => p;

    expect(() => {
      routes.add([
        { name: "bad3", path: "/bad3/:id", encodeParams: asyncFn as never },
      ]);
    }).toThrow(TypeError);
    expect(() => {
      routes.add([
        { name: "bad4", path: "/bad4/:id", encodeParams: asyncFn as never },
      ]);
    }).toThrow("encodeParams cannot be async");
  });

  it("throws when forwardTo callback is async", () => {
    const routes = getRoutesApi(router);

    const asyncForwardTo = async () => "home";

    expect(() => {
      routes.add([
        { name: "fwd", path: "/fwd", forwardTo: asyncForwardTo as never },
      ]);
    }).toThrow(TypeError);
    expect(() => {
      routes.add([
        { name: "fwd2", path: "/fwd2", forwardTo: asyncForwardTo as never },
      ]);
    }).toThrow("forwardTo callback cannot be async");
  });
});
