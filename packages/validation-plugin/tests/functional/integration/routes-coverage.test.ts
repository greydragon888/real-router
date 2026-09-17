import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import {
  throwIfInternalRoute,
  throwIfInternalRouteInArray,
  validateAddRouteArgs,
  validateParentOption,
  validateIsActiveRouteArgs,
  validateUpdateRouteBasicArgs,
  validateUpdateRoutePropertyTypes,
  validateBuildPathArgs,
  validateSetRootPathArgs,
  validateRoutes,
  validateForwardToParamCompatibility,
  validateForwardToCycle,
  validateUpdateRoute,
} from "../../../src/validators/routes";

import type { RouteLookup } from "../../../src/validators/forwardTo";
import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

describe("throwIfInternalRoute — direct", () => {
  it("throws when name starts with @@", () => {
    expect(() => {
      throwIfInternalRoute("@@internal", "test");
    }).toThrow(/reserved.*prefix|@@/i);
  });

  it("does not throw for regular route names", () => {
    expect(() => {
      throwIfInternalRoute("home", "test");
    }).not.toThrow();
  });
});

describe("throwIfInternalRouteInArray — direct", () => {
  it("throws for route with @@ prefix", () => {
    expect(() => {
      throwIfInternalRouteInArray(
        [{ name: "@@internal", path: "/x" }] as never,
        "test",
      );
    }).toThrow();
  });

  it("throws when child route has @@ prefix — children recursion", () => {
    expect(() => {
      throwIfInternalRouteInArray(
        [
          {
            name: "parent",
            path: "/parent",
            children: [{ name: "@@child", path: "/child" }],
          },
        ] as never,
        "test",
      );
    }).toThrow();
  });

  it("does not throw for routes without @@ prefix", () => {
    expect(() => {
      throwIfInternalRouteInArray([{ name: "home", path: "/home" }], "test");
    }).not.toThrow();
  });
});

describe("validateAddRouteArgs — direct", () => {
  it("throws TypeError for null route", () => {
    expect(() => {
      validateAddRouteArgs([null as never]);
    }).toThrow(TypeError);
  });

  it("throws TypeError for array route", () => {
    expect(() => {
      validateAddRouteArgs([[] as never]);
    }).toThrow(TypeError);
  });

  it("passes for valid route object", () => {
    expect(() => {
      validateAddRouteArgs([{ name: "test", path: "/test" }]);
    }).not.toThrow();
  });
});

describe("validateParentOption — direct", () => {
  it("throws TypeError when parent is not a string", () => {
    expect(() => {
      validateParentOption(123);
    }).toThrow(TypeError);
    expect(() => {
      validateParentOption(null);
    }).toThrow(TypeError);
  });

  it("throws TypeError when parent is empty string", () => {
    expect(() => {
      validateParentOption("");
    }).toThrow(TypeError);
  });

  it("passes for valid parent string", () => {
    expect(() => {
      validateParentOption("admin");
    }).not.toThrow();
  });
});

describe("validateIsActiveRouteArgs — direct", () => {
  it("throws TypeError when name is not a string", () => {
    expect(() => {
      validateIsActiveRouteArgs(123, undefined, undefined, undefined);
    }).toThrow(TypeError);
    expect(() => {
      validateIsActiveRouteArgs(null, undefined, undefined, undefined);
    }).toThrow(TypeError);
  });

  it("passes for valid route name", () => {
    expect(() => {
      validateIsActiveRouteArgs("home", undefined, undefined, undefined);
    }).not.toThrow();
  });
});

describe("validateUpdateRouteBasicArgs — direct", () => {
  it("throws ReferenceError for empty name string", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("", {});
    }).toThrow(ReferenceError);
  });

  it("throws TypeError for null updates", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("home", null);
    }).toThrow(TypeError);
  });

  it("throws TypeError for array updates", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("home", ["array"]);
    }).toThrow(TypeError);
  });

  it("passes for valid name and updates object", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("home", {});
    }).not.toThrow();
  });
});

describe("validateUpdateRoutePropertyTypes — direct", () => {
  const NOTHING = {
    forwardTo: undefined,
    defaultParams: undefined,
    defaultSearch: undefined,
    decodeParams: undefined,
    encodeParams: undefined,
    canActivate: undefined,
    canDeactivate: undefined,
  };
  const withField = (field: string, value: unknown) => ({
    ...NOTHING,
    [field]: value,
  });

  // ⚑ One cell per (slot, shape). The record replaced seven positional
  // `unknown`s, where a transposition compiled fine (#1787).
  it.each([
    ["forwardTo", "a number", 123],
    ["forwardTo", "an async callback", async () => "home"],
    ["defaultParams", "a string", "string"],
    ["defaultParams", "an array", [1, 2, 3]],
    ["defaultSearch", "a string", "string"],
    ["defaultSearch", "an array", [1, 2, 3]],
    ["decodeParams", "a string", "not-fn"],
    ["encodeParams", "a number", 123],
    ["canActivate", "a boolean", false],
    ["canDeactivate", "a boolean", true],
  ])("refuses %s that is %s", (field, _shape, value) => {
    expect(() => {
      validateUpdateRoutePropertyTypes(withField(field, value));
    }).toThrow(TypeError);
  });

  it.each([
    ["forwardTo", "a route name", "home"],
    ["forwardTo", "a sync callback", () => "home"],
    ["forwardTo", "null", null],
    ["defaultParams", "a bag", { a: "1" }],
    ["defaultSearch", "a bag", { q: "1" }],
    ["defaultSearch", "null", null],
    ["decodeParams", "a function", (c: unknown) => c],
    ["encodeParams", "a function", (c: unknown) => c],
    ["canActivate", "a factory", () => () => true],
    ["canDeactivate", "null", null],
  ])("accepts %s that is %s", (field, _shape, value) => {
    expect(() => {
      validateUpdateRoutePropertyTypes(withField(field, value));
    }).not.toThrow();
  });

  it("accepts an empty patch", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(NOTHING);
    }).not.toThrow();
  });
});

describe("validateBuildPathArgs — direct", () => {
  it("throws TypeError for empty string", () => {
    expect(() => {
      validateBuildPathArgs("");
    }).toThrow(TypeError);
  });

  it("passes for valid route name", () => {
    expect(() => {
      validateBuildPathArgs("home");
    }).not.toThrow();
  });
});

describe("validateSetRootPathArgs — direct", () => {
  it("throws TypeError for non-string rootPath", () => {
    expect(() => {
      validateSetRootPathArgs(null);
    }).toThrow(TypeError);
    expect(() => {
      validateSetRootPathArgs(123);
    }).toThrow(TypeError);
    expect(() => {
      validateSetRootPathArgs({});
    }).toThrow(TypeError);
  });

  it("passes for string rootPath", () => {
    expect(() => {
      validateSetRootPathArgs("/api");
    }).not.toThrow();
    expect(() => {
      validateSetRootPathArgs("");
    }).not.toThrow();
  });
});

/**
 * A `RouteLookup` built from a plain table: which names exist, and each one's
 * path slots. The real one reads `PluginApi.getTree()` and `getUrlParams` (#2382).
 */
function lookupOf(table: Record<string, readonly string[]>): RouteLookup {
  return {
    hasRoute: (name) => Object.hasOwn(table, name),
    getUrlParams: (name) => table[name] ?? [],
  };
}

describe("validateRoutes — direct calls", () => {
  // ⚑ The "no tree" and "undefined tree and forwardMap" arms are GONE with the
  // store parameter (#2382): the tree, the lookup and the one-hop map are
  // required, because the wrapper always has all three from `PluginApi`.

  it("throws when parentName segment not found in tree", () => {
    const mockTree = {
      children: new Map(),
      paramMeta: { urlParams: [] },
    };

    expect(() => {
      validateRoutes(
        [{ name: "child", path: "/child" }],
        mockTree as never,
        lookupOf({}),
        {},
        "nonexistent",
      );
    }).toThrow(/does not exist/i);
  });

  it("passes when parentName resolves in tree — uses real router tree", () => {
    const r = createRouter([
      { name: "home", path: "/home" },
      { name: "items", path: "/items/:id" },
    ]);

    r.usePlugin(validationPlugin());
    const api = getPluginApi(r);

    expect(() => {
      validateRoutes(
        [{ name: "child", path: "/child" }],
        api.getTree(),
        { hasRoute: () => true, getUrlParams: (n) => api.getUrlParams(n) },
        api.getForwardMap(),
        "home",
      );
    }).not.toThrow();

    r.stop();
  });
});

describe("validateForwardToParamCompatibility — direct", () => {
  it("throws when target requires params not in source", () => {
    expect(() => {
      validateForwardToParamCompatibility(
        "source",
        "target",
        lookupOf({ source: [], target: ["id"] }),
      );
    }).toThrow(/params/i);
  });

  it("passes when source has all required params of target", () => {
    expect(() => {
      validateForwardToParamCompatibility(
        "source",
        "target",
        lookupOf({ source: ["id"], target: ["id"] }),
      );
    }).not.toThrow();
  });
});

describe("validateForwardToCycle — direct", () => {
  it("throws when cycle is created", () => {
    expect(() => {
      validateForwardToCycle("a", "b", { a: "b", b: "a" });
    }).toThrow(/[Cc]ircular|[Cc]ycle/);
  });

  it("passes when no cycle exists", () => {
    expect(() => {
      validateForwardToCycle("a", "b", {});
    }).not.toThrow();
  });
});

describe("validateUpdateRoute — direct", () => {
  it("throws ReferenceError when route does not exist", () => {
    expect(() => {
      validateUpdateRoute("nonexistent", undefined, lookupOf({}), {});
    }).toThrow(ReferenceError);
  });

  it("throws when forwardTo target does not exist", () => {
    expect(() => {
      validateUpdateRoute("home", "nonexistent", lookupOf({ home: [] }), {});
    }).toThrow(/does not exist/);
  });

  it("throws when forwardTo target requires params not in source", () => {
    expect(() => {
      validateUpdateRoute(
        "home",
        "items",
        lookupOf({ home: [], items: ["id"] }),
        {},
      );
    }).toThrow(/params/i);
  });

  it("throws when forwardTo creates a cycle", () => {
    expect(() => {
      validateUpdateRoute("b", "a", lookupOf({ a: [], b: [] }), { a: "b" });
    }).toThrow(/[Cc]ircular|[Cc]ycle/);
  });

  it("passes when route exists with no forwardTo", () => {
    expect(() => {
      validateUpdateRoute("home", undefined, lookupOf({ home: [] }), {});
    }).not.toThrow();
  });

  it("passes when route exists with valid forwardTo", () => {
    expect(() => {
      validateUpdateRoute(
        "home",
        "about",
        lookupOf({ home: [], about: [] }),
        {},
      );
    }).not.toThrow();
  });
});

describe("routes validators — via router API integration", () => {
  let router: Router;
  let routes: RoutesApi;

  beforeEach(() => {
    router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "items", path: "/items/:id" },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(validationPlugin());
    routes = getRoutesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("throwIfInternalRoute wrapper — remove internal route throws", () => {
    const raw = routes as unknown as { remove: (n: unknown) => void };

    expect(() => {
      raw.remove("@@internal");
    }).toThrow();
  });

  it("throwIfInternalRoute wrapper — update internal route throws", () => {
    expect(() => {
      routes.update("@@internal", {});
    }).toThrow();
  });

  it("validateParentOption wrapper — nonexistent parent throws does not exist", () => {
    expect(() => {
      routes.add([{ name: "child", path: "/child" }], {
        parent: "nonexistent",
      });
    }).toThrow(/does not exist/i);
  });

  it("validateParentOption wrapper — valid parent does not throw", () => {
    expect(() => {
      routes.add([{ name: "child", path: "/child" }], { parent: "home" });
    }).not.toThrow();
  });

  it("validateUpdateRoute wrapper — route not found throws", () => {
    expect(() => {
      routes.update("nonexistent", {});
    }).toThrow(ReferenceError);
  });

  it("validateUpdateRoute wrapper — valid update does not throw", () => {
    expect(() => {
      routes.update("home", {});
    }).not.toThrow();
  });
});
