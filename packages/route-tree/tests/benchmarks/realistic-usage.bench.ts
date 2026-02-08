/**
 * Realistic Usage Benchmarks
 *
 * Tests matchSegments with different matcher configurations.
 * Purpose: Compare matcher performance across option patterns.
 *
 * IMPORTANT: match() is a non-mutating operation.
 * Matcher must be created OUTSIDE bench blocks.
 *
 * Key insight: real-router creates a single matcher with baked-in options.
 */

import { barplot, bench, summary } from "mitata";

import { createRouteTree } from "../../src/builder";
import { createMatcher } from "../../src/createMatcher";

import type { CreateMatcherOptions, Matcher } from "../../src/createMatcher";

function createRegisteredMatcher(
  tree: any,
  options?: CreateMatcherOptions,
): Matcher {
  const matcher = createMatcher(options);

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

const SHALLOW_PATH = "/users";
const DEEP_PATH = "/users/123/settings";

// =============================================================================
// Matchers with different option patterns (baked in at creation)
// =============================================================================

const matcherDefault = createRegisteredMatcher(tree);

const matcherStrict = createRegisteredMatcher(tree, {
  strictTrailingSlash: true,
});

const matcherRealRouter = createRegisteredMatcher(tree, {
  strictTrailingSlash: false,
});

const matcherRealRouterQuery = createRegisteredMatcher(tree, {
  strictQueryParams: false,
  strictTrailingSlash: false,
});

// =============================================================================
// Benchmarks: Matcher configuration comparison
// =============================================================================

barplot(() => {
  summary(() => {
    bench("shallow: default options", () => {
      matcherDefault.match(SHALLOW_PATH);
    });

    bench("shallow: strict trailing slash", () => {
      matcherStrict.match(SHALLOW_PATH);
    });

    bench("shallow: real-router pattern", () => {
      matcherRealRouter.match(SHALLOW_PATH);
    });

    bench("shallow: real-router + query params", () => {
      matcherRealRouterQuery.match(SHALLOW_PATH);
    });
  });
});

barplot(() => {
  summary(() => {
    bench("deep: default options", () => {
      matcherDefault.match(DEEP_PATH);
    });

    bench("deep: strict trailing slash", () => {
      matcherStrict.match(DEEP_PATH);
    });

    bench("deep: real-router pattern", () => {
      matcherRealRouter.match(DEEP_PATH);
    });

    bench("deep: real-router + query params", () => {
      matcherRealRouterQuery.match(DEEP_PATH);
    });
  });
});

// =============================================================================
// Benchmark: Matcher configuration overhead
// =============================================================================

barplot(() => {
  summary(() => {
    bench("config: default matcher", () => {
      matcherDefault.match(DEEP_PATH);
    });

    bench("config: strict trailing slash", () => {
      matcherStrict.match(DEEP_PATH);
    });

    bench("config: real-router pattern", () => {
      matcherRealRouter.match(DEEP_PATH);
    });

    bench("config: real-router + query params", () => {
      matcherRealRouterQuery.match(DEEP_PATH);
    });
  });
});
