/**
 * Realistic Usage Benchmarks
 *
 * Tests matchSegments with options patterns that match real real-router usage.
 * Purpose: Validate if pre-computed config caching in match.ts is effective.
 *
 * Key insight: real-router always passes 4-5 options, bypassing single-option cache paths.
 */

import { barplot, bench, summary } from "mitata";

import { createRouteTree } from "../../modules/builder";
import { matchSegments } from "../../modules/operations/match";

import type { MatchOptions } from "../../modules/types";

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

// Pattern 3: Real real-router options (bypasses all caches, 4+ fields)
// Based on packages/real-router/modules/core/routes.ts:165-171
const router6RealOptions: MatchOptions = {
  trailingSlashMode: "default",
  caseSensitive: false,
  strictTrailingSlash: false,
  strongMatching: false,
};

// Pattern 4: Router6 with query params (common real-world case)
const router6WithQueryParams: MatchOptions = {
  trailingSlashMode: "default",
  queryParamsMode: "default",
  caseSensitive: false,
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
      matchSegments(tree, SHALLOW_PATH, router6RealOptions);
    });

    bench("shallow: real-router + query (5 fields, no cache)", () => {
      matchSegments(tree, SHALLOW_PATH, router6WithQueryParams);
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
      matchSegments(tree, DEEP_PATH, router6RealOptions);
    });

    bench("deep: real-router + query (5 fields, no cache)", () => {
      matchSegments(tree, DEEP_PATH, router6WithQueryParams);
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
      matchSegments(tree, DEEP_PATH, router6RealOptions);
    });

    // Pre-created options object (simulates real-router caching options)
    const cachedOptions = { ...router6RealOptions };

    bench("config: real-router pre-cached object", () => {
      matchSegments(tree, DEEP_PATH, cachedOptions);
    });
  });
});
