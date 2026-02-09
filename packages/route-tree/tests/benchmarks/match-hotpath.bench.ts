/**
 * match() Hot Path Micro-Benchmarks (route-tree layer)
 *
 * Pure path-matcher benchmarks (baseline, params, query, constraints,
 * depth, slash child) live in packages/path-matcher/tests/benchmarks/.
 *
 * This file tests route-tree-specific concerns:
 * - 7. Default options overhead (createMatchOptions)
 * - 8. Wide tree segment trie lookup scaling
 *
 * IMPORTANT: match() is a non-mutating operation.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, lineplot, summary } from "mitata";

import { createRouteTree } from "../../src/builder";
import { createMatcher as createMatcherFactory } from "../../src/createMatcher";

import type { CreateMatcherOptions, Matcher } from "../../src/createMatcher";
import type { RouteDefinition } from "../../src/types";

/** Creates a pre-registered matcher for a given route tree (reusable across iterations) */
function createMatcher(
  routes: RouteDefinition[],
  options?: CreateMatcherOptions,
): Matcher {
  const tree = createRouteTree("", "", routes);
  const matcher = createMatcherFactory(options);

  matcher.registerTree(tree);

  return matcher;
}

// =============================================================================
// JIT Warmup: Pre-warm all match code paths to avoid cold-start bias
// =============================================================================
{
  const warmupRoutes: RouteDefinition[] = Array.from(
    { length: 50 },
    (_, i) => ({
      name: `route-${i}`,
      path: `/route-${i}`,
    }),
  );
  const warmupMatcher = createMatcher([
    { name: "users", path: "/users/:id" },
    ...warmupRoutes,
  ]);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/users/123");
    warmupMatcher.match("/route-25");
    warmupMatcher.match("/nonexistent");
  }
}

// =============================================================================
// 7. Real-router option patterns: measures createMatchOptions overhead (5.1)
// =============================================================================

barplot(() => {
  summary(() => {
    const matcher = createMatcher([{ name: "users", path: "/users/:id" }]);

    bench("hot: default options", () => {
      matcher.match("/users/123");
    });
  });
});

// =============================================================================
// 8. Wide tree: measures segment trie lookup scaling
// =============================================================================

lineplot(() => {
  summary(() => {
    const sizes = [10, 50, 200, 500];

    for (const size of sizes) {
      const routes: RouteDefinition[] = Array.from(
        { length: size },
        (_, i) => ({
          name: `route-${i}`,
          path: `/route-${i}`,
        }),
      );
      const matcher = createMatcher(routes);
      // Match middle route to avoid edge effects
      const targetPath = `/route-${Math.floor(size / 2)}`;

      bench(`hot: wide ${size} routes (middle)`, () => {
        matcher.match(targetPath);
      });
    }
  });
});
