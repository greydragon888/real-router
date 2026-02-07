/**
 * Realistic Usage Benchmarks
 *
 * Tests matchSegments with options patterns that match real-router usage.
 * Purpose: Validate if pre-computed config caching in match.ts is effective.
 *
 * Key insight: real-router always passes 4-5 options, bypassing single-option cache paths.
 */

import { barplot, bench, summary } from "mitata";

import { createRouteTree } from "../../src/builder";
import { MatcherService } from "../../src/services/MatcherService";

import type { MatchOptions } from "../../src/types";

function matchSegments(tree: any, path: string, options?: any) {
  const matcher = new MatcherService();

  matcher.registerTree(tree);

  return matcher.match(path, options) ?? null;
}

// =============================================================================
// Test fixtures
// =============================================================================

const routes = [
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "view",
        path: "/:id",
        children: [{ name: "settings", path: "/settings" }],
      },
    ],
  },
  { name: "posts", path: "/posts/:id" },
  { name: "home", path: "/" },
];

const tree = createRouteTree("", "", routes);

// Test paths
const SHALLOW_PATH = "/users";
const DEEP_PATH = "/users/123/settings";

// =============================================================================
// Option patterns
// =============================================================================

// Pattern 1: No options (uses DEFAULT_CONFIG cache)
const noOptions: MatchOptions = {};

// Pattern 2: Single option (uses CONFIG_* cache if matching)
const singleOption: MatchOptions = {
  strictTrailingSlash: true,
};

// Pattern 3: Real-Router options (bypasses all caches, 4+ fields)
// Based on packages/real-router/modules/core/routes.ts:165-171
const realRouterRealOptions: MatchOptions = {
  trailingSlashMode: "default",
  strictTrailingSlash: false,
  strongMatching: false,
};

// Pattern 4: Real-Router with query params (common real-world case)
const realRouterWithQueryParams: MatchOptions = {
  trailingSlashMode: "default",
  queryParamsMode: "default",
  strictTrailingSlash: false,
  strongMatching: false,
};

// =============================================================================
// Benchmarks: Options caching effectiveness
// =============================================================================

barplot(() => {
  summary(() => {
    // Shallow match
    bench("shallow: no options (cached)", () => {
      matchSegments(tree, SHALLOW_PATH, noOptions);
    });

    bench("shallow: single option (partial cache)", () => {
      matchSegments(tree, SHALLOW_PATH, singleOption);
    });

    bench("shallow: real-router real (4 fields, no cache)", () => {
      matchSegments(tree, SHALLOW_PATH, realRouterRealOptions);
    });

    bench("shallow: real-router + query (5 fields, no cache)", () => {
      matchSegments(tree, SHALLOW_PATH, realRouterWithQueryParams);
    });
  });
});

barplot(() => {
  summary(() => {
    // Deep match (3 levels)
    bench("deep: no options (cached)", () => {
      matchSegments(tree, DEEP_PATH, noOptions);
    });

    bench("deep: single option (partial cache)", () => {
      matchSegments(tree, DEEP_PATH, singleOption);
    });

    bench("deep: real-router real (4 fields, no cache)", () => {
      matchSegments(tree, DEEP_PATH, realRouterRealOptions);
    });

    bench("deep: real-router + query (5 fields, no cache)", () => {
      matchSegments(tree, DEEP_PATH, realRouterWithQueryParams);
    });
  });
});

// =============================================================================
// Benchmark: Config creation overhead
// =============================================================================

barplot(() => {
  summary(() => {
    // Isolate config creation cost by running same path
    bench("config: empty options (DEFAULT_CONFIG)", () => {
      matchSegments(tree, DEEP_PATH);
    });

    bench("config: no options object", () => {
      matchSegments(tree, DEEP_PATH, noOptions);
    });

    bench("config: real-router pattern", () => {
      matchSegments(tree, DEEP_PATH, realRouterRealOptions);
    });

    // Pre-created options object (simulates real-router caching options)
    const cachedOptions = { ...realRouterRealOptions };

    bench("config: real-router pre-cached object", () => {
      matchSegments(tree, DEEP_PATH, cachedOptions);
    });
  });
});
