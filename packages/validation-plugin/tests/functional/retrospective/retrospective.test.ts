import { describe, it, expect } from "vitest";

import {
  validateExistingRoutes,
  validateForwardToConsistency,
  validateRoutePropertiesStore,
  validateForwardToTargetsStore,
  validateDependenciesStructure,
  validateLimitsConsistency,
  validateResolvedDefaultRoute,
} from "../../../src/validators/retrospective";

function makeTree(routes: { name: string; children?: typeof routes }[] = []) {
  function buildChildren(items: typeof routes): Map<string, unknown> {
    const map = new Map<string, unknown>();

    for (const item of items) {
      map.set(item.name, {
        children: buildChildren(item.children ?? []),
        paramMeta: { urlParams: [], spatParams: [] },
      });
    }

    return map;
  }

  return {
    children: buildChildren(routes),
    paramMeta: { urlParams: [], spatParams: [] },
  };
}

function makeStore(
  opts: {
    definitions?: unknown[];
    forwardMap?: Record<string, string>;
    forwardFnMap?: Record<string, unknown>;
    decoders?: Record<string, unknown>;
    encoders?: Record<string, unknown>;
    defaultParams?: Record<string, unknown>;
    treeRoutes?: { name: string }[];
  } = {},
) {
  const treeRoutes = opts.treeRoutes ?? [];

  return {
    definitions:
      opts.definitions ??
      treeRoutes.map((r) => ({ name: r.name, path: `/${r.name}` })),
    config: {
      forwardMap: opts.forwardMap ?? {},
      forwardFnMap: opts.forwardFnMap ?? {},
      decoders: opts.decoders ?? {},
      encoders: opts.encoders ?? {},
      defaultParams: opts.defaultParams ?? {},
    },
    tree: makeTree(treeRoutes),
    matcher: {
      getSegmentsByName: (name: string) => {
        const found = treeRoutes.some((r) => r.name === name);

        return found
          ? [{ paramMeta: { urlParams: [], spatParams: [] } }]
          : null;
      },
    },
  };
}

function makeDeps(
  opts: {
    dependencies?: Record<string, unknown>;
    limits?: Record<string, unknown>;
  } = {},
) {
  return {
    dependencies: opts.dependencies ?? {},
    limits: opts.limits ?? {
      maxDependencies: 100,
      maxPlugins: 50,
      maxListeners: 10_000,
      warnListeners: 1000,
      maxLifecycleHandlers: 200,
    },
  };
}

describe("validateExistingRoutes", () => {
  it("throws TypeError when store is not an object", () => {
    expect(() => {
      validateExistingRoutes(null);
    }).toThrow(TypeError);
    expect(() => {
      validateExistingRoutes("string");
    }).toThrow(TypeError);
    expect(() => {
      validateExistingRoutes(42);
    }).toThrow(TypeError);
  });

  it("throws TypeError when store.definitions is not an array", () => {
    expect(() => {
      validateExistingRoutes({
        definitions: "not-array",
        config: {},
        tree: {},
      });
    }).toThrow(TypeError);
  });

  it("throws TypeError when store.config is not an object", () => {
    expect(() => {
      validateExistingRoutes({ definitions: [], config: null, tree: {} });
    }).toThrow(TypeError);
  });

  it("throws TypeError when store.tree is not an object", () => {
    expect(() => {
      validateExistingRoutes({ definitions: [], config: {}, tree: null });
    }).toThrow(TypeError);
  });

  it("passes with empty definitions", () => {
    expect(() => {
      validateExistingRoutes(makeStore());
    }).not.toThrow();
  });

  it("passes with valid definitions", () => {
    expect(() => {
      validateExistingRoutes(
        makeStore({
          definitions: [
            { name: "home", path: "/home" },
            { name: "about", path: "/about" },
          ],
        }),
      );
    }).not.toThrow();
  });

  it("throws when route has invalid name (empty)", () => {
    expect(() => {
      validateExistingRoutes(
        makeStore({
          definitions: [{ name: "", path: "/bad" }],
        }),
      );
    }).toThrow(TypeError);
  });

  it("throws when route path is not a string", () => {
    expect(() => {
      validateExistingRoutes(
        makeStore({
          definitions: [{ name: "bad", path: 123 }],
        }),
      );
    }).toThrow(TypeError);
  });

  it("validates nested definitions recursively", () => {
    expect(() => {
      validateExistingRoutes(
        makeStore({
          definitions: [
            {
              name: "parent",
              path: "/parent",
              children: [{ name: "child", path: "/child" }],
            },
          ],
        }),
      );
    }).not.toThrow();
  });
});

describe("validateForwardToConsistency — chain depth limit", () => {
  it("throws when forwardTo chain exceeds max depth (101 entries)", () => {
    const routeCount = 102;
    const treeRoutes = Array.from({ length: routeCount }, (_, i) => ({
      name: `r${i}`,
    }));
    const forwardMap: Record<string, string> = {};

    for (let i = 0; i < routeCount - 1; i++) {
      forwardMap[`r${i}`] = `r${i + 1}`;
    }

    const store = makeStore({ treeRoutes, forwardMap });

    expect(() => {
      validateForwardToConsistency(store);
    }).toThrow(/exceeds maximum depth/);
  });
});

describe("validateForwardToConsistency", () => {
  it("passes with empty forwardMap", () => {
    const store = makeStore({ treeRoutes: [{ name: "home" }] });

    expect(() => {
      validateForwardToConsistency(store);
    }).not.toThrow();
  });

  it("throws when forwardTo target does not exist in tree", () => {
    const store = makeStore({
      treeRoutes: [{ name: "home" }],
      forwardMap: { home: "nonexistent" },
    });

    expect(() => {
      validateForwardToConsistency(store);
    }).toThrow(/does not exist in tree/);
  });

  it("passes when forwardTo target exists in tree", () => {
    const store = makeStore({
      treeRoutes: [{ name: "home" }, { name: "about" }],
      forwardMap: { home: "about" },
    });

    expect(() => {
      validateForwardToConsistency(store);
    }).not.toThrow();
  });

  it("throws on circular forwardTo chain", () => {
    const store = makeStore({
      treeRoutes: [{ name: "a" }, { name: "b" }],
      forwardMap: { a: "b", b: "a" },
    });

    expect(() => {
      validateForwardToConsistency(store);
    }).toThrow(/circular/i);
  });

  it("detects param incompatibility when target requires params absent in source", () => {
    const treeRoutes = [{ name: "home" }, { name: "product" }];
    const storeWithParams = {
      definitions: [
        { name: "home", path: "/home" },
        { name: "product", path: "/product/:id" },
      ],
      config: {
        forwardMap: { home: "product" },
        forwardFnMap: {},
        decoders: {},
        encoders: {},
        defaultParams: {},
      },
      tree: makeTree(treeRoutes),
      matcher: {
        getSegmentsByName: (name: string) => {
          if (name === "product") {
            return [{ paramMeta: { urlParams: ["id"], spatParams: [] } }];
          }
          if (name === "home") {
            return [{ paramMeta: { urlParams: [], spatParams: [] } }];
          }

          return null;
        },
      },
    };

    expect(() => {
      validateForwardToConsistency(storeWithParams);
    }).toThrow(/requires params/i);
  });

  it("passes when matcher returns null for both segments — covers FALSE branch of sourceSegments check", () => {
    const store = {
      definitions: [
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ],
      config: {
        forwardMap: { a: "b" },
        forwardFnMap: {},
        decoders: {},
        encoders: {},
        defaultParams: {},
      },
      tree: makeTree([{ name: "a" }, { name: "b" }]),
      matcher: {
        getSegmentsByName: () => null,
      },
    };

    expect(() => {
      validateForwardToConsistency(store);
    }).not.toThrow();
  });

  it("covers collectUrlParams spatParams — target with spatParam is required but absent in source", () => {
    const treeRoutes = [{ name: "home" }, { name: "files" }];
    const storeWithSplat = {
      definitions: [
        { name: "home", path: "/home" },
        { name: "files", path: "/files/*path" },
      ],
      config: {
        forwardMap: { home: "files" },
        forwardFnMap: {},
        decoders: {},
        encoders: {},
        defaultParams: {},
      },
      tree: makeTree(treeRoutes),
      matcher: {
        getSegmentsByName: (name: string) => {
          if (name === "files") {
            return [{ paramMeta: { urlParams: [], spatParams: ["path"] } }];
          }
          if (name === "home") {
            return [{ paramMeta: { urlParams: [], spatParams: [] } }];
          }

          return null;
        },
      },
    };

    expect(() => {
      validateForwardToConsistency(storeWithSplat);
    }).toThrow(/requires params/i);
  });
});

describe("validateRoutePropertiesStore", () => {
  it("passes with empty config", () => {
    expect(() => {
      validateRoutePropertiesStore(makeStore());
    }).not.toThrow();
  });

  it("throws when decoder is not a function", () => {
    const store = makeStore({ decoders: { home: "not-a-function" } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/decoder must be a function/);
  });

  it("throws when async decoder is detected", () => {
    const store = makeStore({
      decoders: { home: async () => ({}) },
    });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/cannot be async/);
  });

  it("passes with valid sync decoder", () => {
    const store = makeStore({
      decoders: { product: ({ id }: { id: string }) => ({ id: Number(id) }) },
    });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).not.toThrow();
  });

  it("throws when encoder is not a function", () => {
    const store = makeStore({ encoders: { home: 42 } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/encoder must be a function/);
  });

  it("throws when async encoder is detected", () => {
    const store = makeStore({
      encoders: { home: async () => ({}) },
    });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/cannot be async/);
  });

  it("passes with valid sync encoder", () => {
    const store = makeStore({
      encoders: { product: ({ id }: { id: number }) => ({ id: String(id) }) },
    });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).not.toThrow();
  });

  it("throws when defaultParams is null", () => {
    const store = makeStore({ defaultParams: { home: null } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/defaultParams must be a plain object/);
  });

  it("throws when defaultParams is an array", () => {
    const store = makeStore({ defaultParams: { home: [] } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
  });

  it("passes with valid defaultParams object", () => {
    const store = makeStore({ defaultParams: { home: { tab: "overview" } } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).not.toThrow();
  });

  it("throws when forwardFnMap callback is not a function", () => {
    const store = makeStore({ forwardFnMap: { home: "not-a-function" } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/forwardTo callback must be a function/);
  });

  it("throws when async forwardFn is detected", () => {
    const store = makeStore({
      forwardFnMap: { home: async () => "target" },
    });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/cannot be async/);
  });

  it("passes with valid sync forwardFn", () => {
    const store = makeStore({
      forwardFnMap: { home: () => "target" },
    });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).not.toThrow();
  });

  it("throws when decoder has __awaiter in toString (transpiled async branch)", () => {
    function transpiledDecoder() {
      return "__awaiter";
    }

    const store = makeStore({ decoders: { home: transpiledDecoder } });

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(TypeError);

    expect(() => {
      validateRoutePropertiesStore(store);
    }).toThrow(/cannot be async/);
  });
});

describe("validateForwardToTargetsStore", () => {
  it("passes with empty forwardMap", () => {
    const store = makeStore({ treeRoutes: [{ name: "home" }] });

    expect(() => {
      validateForwardToTargetsStore(store);
    }).not.toThrow();
  });

  it("throws when forwardTo target does not exist in tree", () => {
    const store = makeStore({
      treeRoutes: [{ name: "home" }],
      forwardMap: { home: "nonexistent" },
    });

    expect(() => {
      validateForwardToTargetsStore(store);
    }).toThrow(/does not exist/);
  });

  it("passes when forwardTo target exists in tree", () => {
    const store = makeStore({
      treeRoutes: [{ name: "home" }, { name: "about" }],
      forwardMap: { home: "about" },
    });

    expect(() => {
      validateForwardToTargetsStore(store);
    }).not.toThrow();
  });

  it("throws TypeError when store is not an object", () => {
    expect(() => {
      validateForwardToTargetsStore(null);
    }).toThrow(TypeError);
  });
});

describe("validateDependenciesStructure", () => {
  it("throws TypeError when deps is not an object", () => {
    expect(() => {
      validateDependenciesStructure(null);
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure("string");
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure(42);
    }).toThrow(TypeError);
  });

  it("throws TypeError when deps.dependencies is not an object", () => {
    expect(() => {
      validateDependenciesStructure({ dependencies: null, limits: {} });
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure({ dependencies: "string", limits: {} });
    }).toThrow(TypeError);
  });

  it("passes with empty dependencies", () => {
    expect(() => {
      validateDependenciesStructure(makeDeps());
    }).not.toThrow();
  });

  it("throws when dependency has a getter", () => {
    const deps = makeDeps();
    const depsWithGetter = {
      dependencies: {} as Record<string, unknown>,
      limits: deps.limits,
    };

    Object.defineProperty(depsWithGetter.dependencies, "secret", {
      get() {
        return "value";
      },
      enumerable: true,
      configurable: true,
    });

    expect(() => {
      validateDependenciesStructure(depsWithGetter);
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure(depsWithGetter);
    }).toThrow(/must not use a getter/);
  });

  it("throws TypeError when deps.limits is not an object", () => {
    expect(() => {
      validateDependenciesStructure({ dependencies: {}, limits: null });
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure({ dependencies: {}, limits: "invalid" });
    }).toThrow(TypeError);
  });

  it("throws TypeError when a limit value is not a number", () => {
    expect(() => {
      validateDependenciesStructure({
        dependencies: {},
        limits: {
          maxDependencies: "100",
          maxPlugins: 50,
          maxListeners: 10_000,
          warnListeners: 1000,
          maxLifecycleHandlers: 200,
        },
      });
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure({
        dependencies: {},
        limits: {
          maxDependencies: "100",
          maxPlugins: 50,
          maxListeners: 10_000,
          warnListeners: 1000,
          maxLifecycleHandlers: 200,
        },
      });
    }).toThrow(/must be a number/);
  });

  it("passes with valid dependencies and limits", () => {
    expect(() => {
      validateDependenciesStructure(
        makeDeps({ dependencies: { api: "https://example.com" } }),
      );
    }).not.toThrow();
  });
});

describe("validateLimitsConsistency", () => {
  it("passes with no options or deps", () => {
    expect(() => {
      validateLimitsConsistency({}, {});
    }).not.toThrow();
  });

  it("passes with undefined options", () => {
    expect(() => {
      validateLimitsConsistency(undefined, makeDeps());
    }).not.toThrow();
  });

  it("throws RangeError when dep count exceeds maxDependencies from deps store", () => {
    const deps = makeDeps({
      // 4 deps > maxDependencies 3 — strictly over (#1225: at-limit is legal, so
      // the throw case is now over-limit, not at-limit).
      dependencies: { dep1: 1, dep2: 2, dep3: 3, dep4: 4 },
      limits: {
        maxDependencies: 3,
        maxPlugins: 50,
        maxListeners: 10_000,
        warnListeners: 1000,
        maxLifecycleHandlers: 200,
      },
    });

    expect(() => {
      validateLimitsConsistency({}, deps);
    }).toThrow(RangeError);
    expect(() => {
      validateLimitsConsistency({}, deps);
    }).toThrow(/dependency count/i);
  });

  it("prefers maxDependencies from options over deps store limit", () => {
    const deps = makeDeps({
      // 3 deps: strictly over the OPTIONS limit (2) but well under the STORE
      // limit (100). The throw proves the options limit is the one applied.
      dependencies: { dep1: 1, dep2: 2, dep3: 3 },
      limits: {
        maxDependencies: 100,
        maxPlugins: 50,
        maxListeners: 10_000,
        warnListeners: 1000,
        maxLifecycleHandlers: 200,
      },
    });

    expect(() => {
      validateLimitsConsistency({ limits: { maxDependencies: 2 } }, deps);
    }).toThrow(RangeError);
  });

  it("passes when deps is null — covers FALSE branch of deps check", () => {
    expect(() => {
      validateLimitsConsistency({}, null);
    }).not.toThrow();
  });

  // #1225 — the live limiter (`validateDependencyCount`) counts BEFORE the
  // insert, so reaching EXACTLY maxDependencies is legal. The retrospective pass
  // checks state, not room-for-next-insert, so it must accept an at-limit store
  // (else every cloneRouter on an at-limit base throws — breaking SSR).
  it("passes when dep count equals maxDependencies (#1225)", () => {
    const deps = makeDeps({
      dependencies: { dep1: 1, dep2: 2, dep3: 3 },
      limits: {
        maxDependencies: 3,
        maxPlugins: 50,
        maxListeners: 10_000,
        warnListeners: 1000,
        maxLifecycleHandlers: 200,
      },
    });

    expect(() => {
      validateLimitsConsistency({}, deps);
    }).not.toThrow();
  });
});

describe("validateResolvedDefaultRoute", () => {
  it("is a no-op when routeName is not a string", () => {
    const store = makeStore({ treeRoutes: [{ name: "home" }] });

    expect(() => {
      validateResolvedDefaultRoute(undefined, store);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute(null, store);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute(42, store);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute({}, store);
    }).not.toThrow();
  });

  it("is a no-op when routeName is empty string", () => {
    const store = makeStore({ treeRoutes: [{ name: "home" }] });

    expect(() => {
      validateResolvedDefaultRoute("", store);
    }).not.toThrow();
  });

  it("passes when route exists in tree", () => {
    const store = makeStore({
      treeRoutes: [{ name: "home" }, { name: "about" }],
    });

    expect(() => {
      validateResolvedDefaultRoute("home", store);
    }).not.toThrow();
  });

  it("passes for nested route that exists in tree", () => {
    const store = {
      definitions: [],
      config: {
        forwardMap: {},
        forwardFnMap: {},
        decoders: {},
        encoders: {},
        defaultParams: {},
      },
      tree: {
        children: new Map([
          [
            "admin",
            {
              children: new Map([
                [
                  "dashboard",
                  {
                    children: new Map(),
                    paramMeta: { urlParams: [], spatParams: [] },
                  },
                ],
              ]),
              paramMeta: { urlParams: [], spatParams: [] },
            },
          ],
        ]),
        paramMeta: { urlParams: [], spatParams: [] },
      },
      matcher: { getSegmentsByName: () => null },
    };

    expect(() => {
      validateResolvedDefaultRoute("admin.dashboard", store);
    }).not.toThrow();
  });

  it("throws when route does not exist in tree", () => {
    const store = makeStore({ treeRoutes: [{ name: "home" }] });

    expect(() => {
      validateResolvedDefaultRoute("missing", store);
    }).toThrow(/defaultRoute resolved to non-existent route: "missing"/);
  });

  it("throws when nested route's parent is missing", () => {
    const store = makeStore({ treeRoutes: [{ name: "home" }] });

    expect(() => {
      validateResolvedDefaultRoute("admin.dashboard", store);
    }).toThrow(/non-existent route: "admin.dashboard"/);
  });

  it("throws TypeError when store is invalid", () => {
    expect(() => {
      validateResolvedDefaultRoute("home", null);
    }).toThrow(TypeError);
  });
});
