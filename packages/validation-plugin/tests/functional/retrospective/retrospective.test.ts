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
import { lookupOf } from "../../helpers";

import type { LimitsConfig } from "@real-router/core";

// The retrospective validators take FACTS rather than core's stores (#2382):
// routes as `RoutesApi.get` reports them, the one-hop forward map, a
// `RouteLookup`, the resolved limits. Each fixture below is one of those facts.

type RouteFixture = Parameters<typeof validateExistingRoutes>[0][number];

const LIMITS: Readonly<LimitsConfig> = {
  maxDependencies: 100,
  maxPlugins: 50,
  maxListeners: 10_000,
  warnListeners: 1000,
  maxLifecycleHandlers: 200,
};

/** A route with one slot set to a value its declared type may rule out. */
function routeWith(slot: string, value: unknown, name = "home"): RouteFixture {
  return { name, path: `/${name}`, [slot]: value };
}

describe("validateExistingRoutes", () => {
  it("passes with no routes", () => {
    expect(() => {
      validateExistingRoutes([]);
    }).not.toThrow();
  });

  it("passes with valid routes", () => {
    expect(() => {
      validateExistingRoutes([
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ]);
    }).not.toThrow();
  });

  it("throws when route has invalid name (empty)", () => {
    expect(() => {
      validateExistingRoutes([{ name: "", path: "/bad" }]);
    }).toThrow(TypeError);
  });

  it("throws when route path is not a string", () => {
    expect(() => {
      validateExistingRoutes([routeWith("path", 123, "bad")]);
    }).toThrow(TypeError);
  });

  it("validates nested routes recursively, naming them by full name", () => {
    expect(() => {
      validateExistingRoutes([
        {
          name: "parent",
          path: "/parent",
          children: [{ name: "child", path: "/child" }],
        },
      ]);
    }).not.toThrow();

    expect(() => {
      validateExistingRoutes([
        {
          name: "parent",
          path: "/parent",
          children: [routeWith("path", 7, "child")],
        },
      ]);
    }).toThrow(/route "parent\.child" has non-string path/);
  });
});

describe("validateForwardToConsistency — chain depth limit", () => {
  it("throws when forwardTo chain exceeds max depth (101 entries)", () => {
    const routeCount = 102;
    const table: Record<string, string[]> = {};
    const forwardMap: Record<string, string> = {};

    for (let i = 0; i < routeCount; i++) {
      table[`r${i}`] = [];
    }

    for (let i = 0; i < routeCount - 1; i++) {
      forwardMap[`r${i}`] = `r${i + 1}`;
    }

    expect(() => {
      validateForwardToConsistency(forwardMap, lookupOf(table));
    }).toThrow(/exceeds maximum depth/);
  });

  it("names ONE subsystem — core's [router] head is replaced, not stacked", () => {
    // Core's refusal opens with `[router] ` (#2456) and this pass re-prefixes it.
    // The cell above matches a substring, so it passes either way; this one is
    // what fails when the two prefixes stack.
    let raised: unknown;

    try {
      validateForwardToConsistency(
        { a: "b", b: "a" },
        lookupOf({ a: [], b: [] }),
      );
    } catch (error) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(Error);
    // The head, not the chain: which route the walk starts from follows key
    // order, and this cell's subject is the prefix.
    expect((raised as Error).message).toMatch(
      /^\[validation-plugin\] Circular forwardTo: /u,
    );
    expect((raised as Error).message).not.toMatch(/\[router\]/u);
    // The cause keeps core's own wording, prefix included. Asserted as an Error
    // first, so dropping `{ cause }` fails with a mismatch and not a TypeError.
    expect((raised as Error).cause).toBeInstanceOf(Error);
    expect(((raised as Error).cause as Error).message).toMatch(
      /^\[router\] Circular forwardTo: /u,
    );
  });
});

describe("validateForwardToConsistency", () => {
  it("passes with empty forwardMap", () => {
    expect(() => {
      validateForwardToConsistency({}, lookupOf({ home: [] }));
    }).not.toThrow();
  });

  it("throws when forwardTo target does not exist in tree", () => {
    expect(() => {
      validateForwardToConsistency(
        { home: "nonexistent" },
        lookupOf({ home: [] }),
      );
    }).toThrow(/does not exist in tree/);
  });

  it("passes when forwardTo target exists in tree", () => {
    expect(() => {
      validateForwardToConsistency(
        { home: "about" },
        lookupOf({ home: [], about: [] }),
      );
    }).not.toThrow();
  });

  it("throws on circular forwardTo chain", () => {
    expect(() => {
      validateForwardToConsistency(
        { a: "b", b: "a" },
        lookupOf({ a: [], b: [] }),
      );
    }).toThrow(/circular/i);
  });

  it("detects param incompatibility when target requires params absent in source", () => {
    expect(() => {
      validateForwardToConsistency(
        { home: "product" },
        lookupOf({ home: [], product: ["id"] }),
      );
    }).toThrow(/requires params/i);
  });

  it("a forwardTo target requiring a splat param the source lacks throws", () => {
    // A splat's name is a url param like any other, so `/files/*path` owns the
    // slot `path`.
    expect(() => {
      validateForwardToConsistency(
        { home: "files" },
        lookupOf({ home: [], files: ["path"] }),
      );
    }).toThrow(/requires params/i);
  });

  it("names each missing slot once, however many times the target lists it", () => {
    expect(() => {
      validateForwardToConsistency(
        { a: "b" },
        lookupOf({ a: [], b: ["x", "x"] }),
      );
    }).toThrow(/requires params \[x\] not available/);
  });
});

describe("validateRoutePropertiesStore", () => {
  it("passes with no routes", () => {
    expect(() => {
      validateRoutePropertiesStore([]);
    }).not.toThrow();
  });

  it("throws when decoder is not a function", () => {
    const routes = [routeWith("decodeParams", "not-a-function")];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/decoder must be a function/);
  });

  it("throws when async decoder is detected", () => {
    const routes = [routeWith("decodeParams", async () => ({}))];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/cannot be async/);
  });

  it("passes with valid sync decoder", () => {
    expect(() => {
      validateRoutePropertiesStore([
        routeWith("decodeParams", ({ id }: { id: string }) => ({
          id: Number(id),
        })),
      ]);
    }).not.toThrow();
  });

  it("throws when encoder is not a function", () => {
    const routes = [routeWith("encodeParams", 42)];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/encoder must be a function/);
  });

  it("throws when async encoder is detected", () => {
    const routes = [routeWith("encodeParams", async () => ({}))];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/cannot be async/);
  });

  it("passes with valid sync encoder", () => {
    expect(() => {
      validateRoutePropertiesStore([
        routeWith("encodeParams", ({ id }: { id: number }) => ({
          id: String(id),
        })),
      ]);
    }).not.toThrow();
  });

  it("throws when defaultParams is null", () => {
    const routes = [routeWith("defaultParams", null)];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/defaultParams must be a plain object/);
  });

  it("throws when defaultParams is an array", () => {
    expect(() => {
      validateRoutePropertiesStore([routeWith("defaultParams", [])]);
    }).toThrow(TypeError);
  });

  it("passes with valid defaultParams object", () => {
    expect(() => {
      validateRoutePropertiesStore([
        routeWith("defaultParams", { tab: "overview" }),
      ]);
    }).not.toThrow();
  });

  it("throws when a non-string forwardTo is not a function", () => {
    const routes = [routeWith("forwardTo", 42)];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/forwardTo callback must be a function/);
  });

  it("throws when async forwardTo callback is detected", () => {
    const routes = [routeWith("forwardTo", async () => "target")];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);
    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/cannot be async/);
  });

  it("passes with a valid sync forwardTo callback and with a string forwardTo", () => {
    expect(() => {
      validateRoutePropertiesStore([
        routeWith("forwardTo", () => "target"),
        routeWith("forwardTo", "target", "other"),
      ]);
    }).not.toThrow();
  });

  it("throws when decoder has __awaiter in toString (transpiled async branch)", () => {
    function transpiledDecoder() {
      return "__awaiter";
    }

    const routes = [routeWith("decodeParams", transpiledDecoder)];

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(TypeError);

    expect(() => {
      validateRoutePropertiesStore(routes);
    }).toThrow(/cannot be async/);
  });

  it("names a nested route by its full name", () => {
    expect(() => {
      validateRoutePropertiesStore([
        {
          name: "parent",
          path: "/parent",
          children: [routeWith("defaultSearch", 5, "child")],
        },
      ]);
    }).toThrow(/route "parent\.child" defaultSearch must be a plain object/);
  });
});

describe("validateForwardToTargetsStore", () => {
  it("passes with empty forwardMap", () => {
    expect(() => {
      validateForwardToTargetsStore({}, lookupOf({ home: [] }));
    }).not.toThrow();
  });

  it("throws when forwardTo target does not exist in tree", () => {
    expect(() => {
      validateForwardToTargetsStore(
        { home: "nonexistent" },
        lookupOf({ home: [] }),
      );
    }).toThrow(/does not exist/);
  });

  it("passes when forwardTo target exists in tree", () => {
    expect(() => {
      validateForwardToTargetsStore(
        { home: "about" },
        lookupOf({ home: [], about: [] }),
      );
    }).not.toThrow();
  });
});

describe("validateDependenciesStructure", () => {
  it("passes with empty dependencies", () => {
    expect(() => {
      validateDependenciesStructure({}, LIMITS);
    }).not.toThrow();
  });

  it("throws when dependency has a getter", () => {
    const dependencies: Record<string, unknown> = {};

    Object.defineProperty(dependencies, "secret", {
      get() {
        return "value";
      },
      enumerable: true,
      configurable: true,
    });

    expect(() => {
      validateDependenciesStructure(dependencies, LIMITS);
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesStructure(dependencies, LIMITS);
    }).toThrow(/must not use a getter/);
  });

  it("throws TypeError when a limit value is not an integer", () => {
    expect(() => {
      validateDependenciesStructure(
        {},
        { ...LIMITS, maxDependencies: "100" as unknown as number },
      );
    }).toThrow(/maxDependencies must be an integer/);

    // ⚑ NaN is the shape that matters. Core coerces limits once at
    // construction (#1875), so a bag spelling a limit as `undefined`, `"abc"`
    // or `{}` arrives here as `Number(x)` — that is `NaN`, and `NaN` is
    // `typeof "number"`. This cell reds if the predicate is weakened to a
    // `typeof` test.
    expect(() => {
      validateDependenciesStructure(
        {},
        { ...LIMITS, maxDependencies: Number.NaN },
      );
    }).toThrow(/maxDependencies must be an integer, got NaN/);

    // ⚑ The other half of that type, and it is what separates `isInteger` from
    // `isFinite`: a limit spelled `1.5` or `Infinity` coerces CLEANLY, so it
    // reaches this pass as an ordinary `number` that no NaN cell can see.
    // `isFinite` in place of `isInteger` passes the whole suite without these
    // two.
    expect(() => {
      validateDependenciesStructure({}, { ...LIMITS, maxDependencies: 1.5 });
    }).toThrow(/maxDependencies must be an integer, got 1.5/);
    expect(() => {
      validateDependenciesStructure(
        {},
        { ...LIMITS, maxPlugins: Number.POSITIVE_INFINITY },
      );
    }).toThrow(/maxPlugins must be an integer, got Infinity/);
  });

  it("passes with valid dependencies and limits", () => {
    expect(() => {
      validateDependenciesStructure({ api: "https://example.com" }, LIMITS);
    }).not.toThrow();
  });
});

describe("validateLimitsConsistency", () => {
  it("passes with no configured limits and no dependencies", () => {
    expect(() => {
      validateLimitsConsistency({}, 0, 100);
    }).not.toThrow();
  });

  it("passes with undefined options", () => {
    expect(() => {
      validateLimitsConsistency(undefined, 0, 100);
    }).not.toThrow();
  });

  it("throws RangeError when dep count exceeds the resolved maxDependencies", () => {
    // 4 deps > maxDependencies 3 — strictly over (#1225: at-limit is legal).
    expect(() => {
      validateLimitsConsistency({}, 4, 3);
    }).toThrow(RangeError);
    expect(() => {
      validateLimitsConsistency({}, 4, 3);
    }).toThrow(/dependency count/i);
  });

  it("prefers maxDependencies from options over the resolved limit", () => {
    // 3 deps: strictly over the OPTIONS limit (2) but well under the RESOLVED
    // limit (100). The throw proves the options limit is the one applied.
    expect(() => {
      validateLimitsConsistency({ limits: { maxDependencies: 2 } }, 3, 100);
    }).toThrow(RangeError);
  });

  it("a limit of 0 means no cap", () => {
    expect(() => {
      validateLimitsConsistency({}, 5, 0);
    }).not.toThrow();
  });

  // #1225 — the live limiter (`validateDependencyCount`) counts BEFORE the
  // insert, so reaching EXACTLY maxDependencies is legal. The retrospective pass
  // checks state, not room-for-next-insert, so it must accept an at-limit store
  // (else every cloneRouter on an at-limit base throws — breaking SSR).
  it("passes when dep count equals maxDependencies (#1225)", () => {
    expect(() => {
      validateLimitsConsistency({}, 3, 3);
    }).not.toThrow();
  });
});

describe("validateResolvedDefaultRoute", () => {
  const lookup = lookupOf({ home: [], about: [], "admin.dashboard": [] });

  it("is a no-op when routeName is not a string", () => {
    expect(() => {
      validateResolvedDefaultRoute(undefined, lookup);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute(null, lookup);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute(42, lookup);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute({}, lookup);
    }).not.toThrow();
  });

  it("is a no-op when routeName is empty string", () => {
    expect(() => {
      validateResolvedDefaultRoute("", lookup);
    }).not.toThrow();
  });

  it("passes when route exists", () => {
    expect(() => {
      validateResolvedDefaultRoute("home", lookup);
    }).not.toThrow();
    expect(() => {
      validateResolvedDefaultRoute("admin.dashboard", lookup);
    }).not.toThrow();
  });

  it("throws when route does not exist", () => {
    expect(() => {
      validateResolvedDefaultRoute("missing", lookup);
    }).toThrow(/defaultRoute resolved to non-existent route: "missing"/);
    expect(() => {
      validateResolvedDefaultRoute("admin.settings", lookup);
    }).toThrow(/non-existent route: "admin.settings"/);
  });
});
