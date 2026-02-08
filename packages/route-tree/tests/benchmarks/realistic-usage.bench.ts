/**
 * Realistic Usage Benchmarks
 *
 * Tests matchSegments with options patterns that match real-router usage.
 * Purpose: Validate if pre-computed config caching in match.ts is effective.
 *
 * IMPORTANT: match() is a non-mutating operation.
 * MatcherService must be created OUTSIDE bench blocks.
 *
 * Key insight: real-router always passes 4-5 options, bypassing single-option cache paths.
 */

import { barplot, bench, summary } from "mitata";

import { createRouteTree } from "../../src/builder";
import { MatcherService } from "../../src/services/MatcherService";

import type { MatchOptions } from "../../src/types";

/** Creates a pre-registered matcher for a given route tree (reusable across iterations) */
function createMatcher(tree: any): MatcherService {
  const matcher = new MatcherService();

  matcher.registerTree(tree);

  return matcher;
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
const matcher = createMatcher(tree);

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
      matcher.match(SHALLOW_PATH, noOptions);
    });

    bench("shallow: single option (partial cache)", () => {
      matcher.match(SHALLOW_PATH, singleOption);
    });

    bench("shallow: real-router real (4 fields, no cache)", () => {
      matcher.match(SHALLOW_PATH, realRouterRealOptions);
    });

    bench("shallow: real-router + query (5 fields, no cache)", () => {
      matcher.match(SHALLOW_PATH, realRouterWithQueryParams);
    });
  });
});

barplot(() => {
  summary(() => {
    // Deep match (3 levels)
    bench("deep: no options (cached)", () => {
      matcher.match(DEEP_PATH, noOptions);
    });

    bench("deep: single option (partial cache)", () => {
      matcher.match(DEEP_PATH, singleOption);
    });

    bench("deep: real-router real (4 fields, no cache)", () => {
      matcher.match(DEEP_PATH, realRouterRealOptions);
    });

    bench("deep: real-router + query (5 fields, no cache)", () => {
      matcher.match(DEEP_PATH, realRouterWithQueryParams);
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
      matcher.match(DEEP_PATH);
    });

    bench("config: no options object", () => {
      matcher.match(DEEP_PATH, noOptions);
    });

    bench("config: real-router pattern", () => {
      matcher.match(DEEP_PATH, realRouterRealOptions);
    });

    // Pre-created options object (simulates real-router caching options)
    const cachedOptions = { ...realRouterRealOptions };

    bench("config: real-router pre-cached object", () => {
      matcher.match(DEEP_PATH, cachedOptions);
    });
  });
});
