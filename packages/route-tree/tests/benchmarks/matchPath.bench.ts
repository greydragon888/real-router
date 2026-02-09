/**
 * matchSegments benchmarks (CRITICAL - HOT PATH)
 *
 * Tests URL matching performance across different scenarios:
 * - Shallow vs deep matching
 * - URL parameters (parameterized)
 * - Query parameters modes
 * - Trailing slash modes
 * - Wide tree scaling (parameterized)
 * - Absolute paths
 *
 * IMPORTANT: match() is a non-mutating operation.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, boxplot, lineplot, summary } from "mitata";

import {
  generateAbsoluteRoutes,
  generateDeepPath,
  generateDeepPathWithParams,
  generateDeepTree,
  generateDeepTreeWithParams,
  generateRouteWithQueryParams,
  generateSpaRoutes,
  generateWideTree,
} from "./helpers/generators";
import { createRouteTree } from "../../src/builder";
import { createMatcher as createMatcherFactory } from "../../src/createMatcher";

import type { Matcher } from "../../src/createMatcher";

/** Creates a pre-registered matcher for a given route tree (reusable across iterations) */
function createMatcher(tree: any): Matcher {
  const matcher = createMatcherFactory();

  matcher.registerTree(tree);

  return matcher;
}

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// =============================================================================
// JIT Warmup: Pre-warm all match code paths to avoid cold-start bias
// Without this, the first benchmarks would be significantly slower due to
// JIT compilation (~20x difference observed)
// =============================================================================
{
  const warmupRoutes = generateSpaRoutes();
  const warmupTree = createRouteTree("", "", warmupRoutes);
  const warmupMatcher = createMatcher(warmupTree);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/");
    warmupMatcher.match("/users");
    warmupMatcher.match("/users/123/details");
    warmupMatcher.match("/nonexistent-path-xyz");
  }
}

// 1.1 Basic matching scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const routes = generateWideTree(50);
    const tree = createRouteTree("", "", routes);
    const matcher = createMatcher(tree);

    bench("matchSegments: shallow first route", () => {
      matcher.match("/route-0");
    });

    bench("matchSegments: shallow last route", () => {
      matcher.match("/route-49");
    });

    bench("matchSegments: no match (worst case)", () => {
      matcher.match("/nonexistent");
    });
  });
});

// 1.2 Deep path matching - lineplot shows scaling trend
lineplot(() => {
  summary(() => {
    bench("matchSegments: deep $levels levels", function* (state: BenchState) {
      const levels = state.get("levels") as number;
      const routes = generateDeepTree(levels);
      const tree = createRouteTree("", "", routes);
      const matcher = createMatcher(tree);
      const path = generateDeepPath(levels);

      yield () => {
        matcher.match(path);
      };
    }).args("levels", [5, 10, 20]);
  });
});

// 1.3 Matching with URL parameters - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("matchSegments: $count URL params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateDeepTreeWithParams(count);
      const tree = createRouteTree("", "", routes);
      const matcher = createMatcher(tree);
      const path = generateDeepPathWithParams(count);

      yield () => {
        matcher.match(path);
      };
    }).args("count", [3, 5, 10]);
  });
});

// 1.4 Query parameters modes - barplot for mode comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "users", path: "/users?page&sort" }];
    const tree = createRouteTree("", "", routes);
    const matcherDefault = createMatcher(tree);
    const matcherStrict = createMatcherFactory({ strictQueryParams: true });

    matcherStrict.registerTree(tree);

    bench("matchSegments: query default mode", () => {
      matcherDefault.match("/users?page=1&sort=name");
    });

    bench("matchSegments: query strict mode", () => {
      matcherStrict.match("/users?page=1&sort=name");
    });

    bench("matchSegments: query default (extra params)", () => {
      matcherDefault.match("/users?page=1&sort=name&extra=val");
    });
  });
});

// 1.5 Many query parameters - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("matchSegments: $count query params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const route = generateRouteWithQueryParams(count);
      const tree = createRouteTree("", "", [route]);
      const matcher = createMatcher(tree);
      const query = Array.from({ length: count }, (_, i) => `q${i}=v${i}`).join(
        "&",
      );

      yield () => {
        matcher.match(`/route?${query}`);
      };
    }).args("count", [5, 10, 20]);
  });
});

// 1.6 Trailing slash modes - barplot for mode comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "users", path: "/users" }];
    const tree = createRouteTree("", "", routes);
    const matcherDefault = createMatcher(tree);
    const matcherStrict = createMatcherFactory({ strictTrailingSlash: true });

    matcherStrict.registerTree(tree);

    bench("matchSegments: trailing slash default", () => {
      matcherDefault.match("/users/");
    });

    bench("matchSegments: strictTrailingSlash", () => {
      matcherStrict.match("/users");
    });
  });
});

// 1.7 Wide tree scaling - lineplot shows O(n) scaling
lineplot(() => {
  summary(() => {
    bench(
      "matchSegments: wide $width (last route)",
      function* (state: BenchState) {
        const width = state.get("width") as number;
        const routes = generateWideTree(width);
        const tree = createRouteTree("", "", routes);
        const matcher = createMatcher(tree);

        yield () => {
          matcher.match(`/route-${width - 1}`);
        };
      },
    ).args("width", [10, 50, 100, 500]);
  });
});

// 1.8 Absolute paths - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const routes = generateAbsoluteRoutes(10);
    const tree = createRouteTree("", "", routes);
    const matcher = createMatcher(tree);

    bench("matchSegments: normal path", () => {
      matcher.match("/normal/nested");
    });

    bench("matchSegments: absolute nested", () => {
      matcher.match("/absolute");
    });

    bench("matchSegments: absolute modal", () => {
      matcher.match("/modal-5");
    });
  });
});
