import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
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
  it("throws TypeError when forwardTo is invalid type (number)", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(123, undefined, undefined, undefined);
    }).toThrow(TypeError);
  });

  it("throws TypeError for async forwardTo callback", () => {
    const asyncFn = async () => "home";

    expect(() => {
      validateUpdateRoutePropertyTypes(
        asyncFn,
        undefined,
        undefined,
        undefined,
      );
    }).toThrow(TypeError);
  });

  it("throws TypeError for invalid defaultParams (string)", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(
        undefined,
        "string",
        undefined,
        undefined,
      );
    }).toThrow(TypeError);
  });

  it("throws TypeError for invalid defaultParams (array)", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(
        undefined,
        [1, 2, 3],
        undefined,
        undefined,
      );
    }).toThrow(TypeError);
  });

  it("throws TypeError for non-function decodeParams", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(
        undefined,
        undefined,
        "not-fn",
        undefined,
      );
    }).toThrow(TypeError);
  });

  it("throws TypeError for non-function encodeParams", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(undefined, undefined, undefined, 123);
    }).toThrow(TypeError);
  });

  it("passes for valid string forwardTo", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes("home", undefined, undefined, undefined);
    }).not.toThrow();
  });

  it("passes for valid sync forwardTo function", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(
        () => "home",
        undefined,
        undefined,
        undefined,
      );
    }).not.toThrow();
  });

  it("passes for null forwardTo", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(null, undefined, undefined, undefined);
    }).not.toThrow();
  });

  it("passes for valid defaultParams object", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(
        undefined,
        { tab: "main" },
        undefined,
        undefined,
      );
    }).not.toThrow();
  });

  it("passes for valid sync decodeParams", () => {
    expect(() => {
      validateUpdateRoutePropertyTypes(
        undefined,
        undefined,
        (p: Record<string, string>) => p,
        undefined,
      );
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

describe("validateRoutes — direct calls", () => {
  it("passes without tree — covers FALSE branch of tree+forwardMap check", () => {
    expect(() => {
      validateRoutes([{ name: "child", path: "/child" }]);
    }).not.toThrow();
  });

  it("passes with undefined tree and forwardMap — skips forwardTo targets check", () => {
    expect(() => {
      validateRoutes([{ name: "child", path: "/child" }], undefined, {});
    }).not.toThrow();
  });

  it("throws when parentName segment not found in tree", () => {
    const mockTree = {
      children: new Map(),
      paramMeta: { urlParams: [], spatParams: [] },
    };

    expect(() => {
      validateRoutes(
        [{ name: "child", path: "/child" }],
        mockTree as never,
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
    const ctx = getInternals(r);
    const store = ctx.routeGetStore();

    expect(() => {
      validateRoutes(
        [{ name: "child", path: "/child" }],
        store.tree as never,
        store.config.forwardMap,
        "home",
      );
    }).not.toThrow();

    r.stop();
  });
});

describe("validateForwardToParamCompatibility — direct", () => {
  it("throws when target requires params not in source", () => {
    const mockMatcher = {
      getSegmentsByName: (name: string) => {
        if (name === "source") {
          return [
            {
              paramMeta: { urlParams: [], spatParams: [] },
              children: new Map(),
            },
          ];
        }
        if (name === "target") {
          return [
            {
              paramMeta: { urlParams: ["id"], spatParams: [] },
              children: new Map(),
            },
          ];
        }

        return null;
      },
    };

    expect(() => {
      validateForwardToParamCompatibility(
        "source",
        "target",
        mockMatcher as never,
      );
    }).toThrow(/params/i);
  });

  it("passes when source has all required params of target", () => {
    const mockMatcher = {
      getSegmentsByName: (name: string) => {
        if (name === "source" || name === "target") {
          return [
            {
              paramMeta: { urlParams: ["id"], spatParams: [] },
              children: new Map(),
            },
          ];
        }

        return null;
      },
    };

    expect(() => {
      validateForwardToParamCompatibility(
        "source",
        "target",
        mockMatcher as never,
      );
    }).not.toThrow();
  });
});

describe("validateForwardToCycle — direct", () => {
  it("throws when cycle is created", () => {
    const config = { forwardMap: { a: "b", b: "a" } };

    expect(() => {
      validateForwardToCycle("a", "b", config);
    }).toThrow(/[Cc]ircular|[Cc]ycle/);
  });

  it("passes when no cycle exists", () => {
    const config = { forwardMap: {} };

    expect(() => {
      validateForwardToCycle("a", "b", config);
    }).not.toThrow();
  });
});

describe("validateUpdateRoute — direct", () => {
  it("throws ReferenceError when route does not exist", () => {
    const mockMatcher = {
      getSegmentsByName: () => [
        { paramMeta: { urlParams: [], spatParams: [] }, children: new Map() },
      ],
    };
    const config = { forwardMap: {} };

    expect(() => {
      validateUpdateRoute(
        "nonexistent",
        undefined,
        () => false,
        mockMatcher as never,
        config,
      );
    }).toThrow(ReferenceError);
  });

  it("throws when forwardTo target does not exist", () => {
    const mockMatcher = {
      getSegmentsByName: () => [
        { paramMeta: { urlParams: [], spatParams: [] }, children: new Map() },
      ],
    };
    const config = { forwardMap: {} };

    expect(() => {
      validateUpdateRoute(
        "home",
        "nonexistent",
        (n: string) => n === "home",
        mockMatcher as never,
        config,
      );
    }).toThrow(/does not exist/);
  });

  it("throws when forwardTo target requires params not in source", () => {
    const mockMatcher = {
      getSegmentsByName: (name: string) => {
        if (name === "home") {
          return [
            {
              paramMeta: { urlParams: [], spatParams: [] },
              children: new Map(),
            },
          ];
        }
        if (name === "items") {
          return [
            {
              paramMeta: { urlParams: ["id"], spatParams: [] },
              children: new Map(),
            },
          ];
        }

        return null;
      },
    };
    const config = { forwardMap: {} };

    expect(() => {
      validateUpdateRoute(
        "home",
        "items",
        () => true,
        mockMatcher as never,
        config,
      );
    }).toThrow(/params/i);
  });

  it("throws when forwardTo creates a cycle", () => {
    const mockMatcher = {
      getSegmentsByName: () => [
        { paramMeta: { urlParams: [], spatParams: [] }, children: new Map() },
      ],
    };
    const config = { forwardMap: { a: "b" } };

    expect(() => {
      validateUpdateRoute("b", "a", () => true, mockMatcher as never, config);
    }).toThrow(/[Cc]ircular|[Cc]ycle/);
  });

  it("passes when route exists with no forwardTo", () => {
    const mockMatcher = {
      getSegmentsByName: () => [
        { paramMeta: { urlParams: [], spatParams: [] }, children: new Map() },
      ],
    };
    const config = { forwardMap: {} };

    expect(() => {
      validateUpdateRoute(
        "home",
        undefined,
        () => true,
        mockMatcher as never,
        config,
      );
    }).not.toThrow();
  });

  it("passes when route exists with valid forwardTo", () => {
    const mockMatcher = {
      getSegmentsByName: () => [
        { paramMeta: { urlParams: [], spatParams: [] }, children: new Map() },
      ],
    };
    const config = { forwardMap: {} };

    expect(() => {
      validateUpdateRoute(
        "home",
        "about",
        () => true,
        mockMatcher as never,
        config,
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
