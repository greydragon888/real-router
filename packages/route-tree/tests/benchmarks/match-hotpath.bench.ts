/**
 * match() Hot Path Micro-Benchmarks
 *
 * Purpose: Track optimization progress for specific bottlenecks
 * identified in the segment trie integration layer.
 *
 * Target areas (from optimization plan):
 * - 1.1 segments.filter() per match → pre-filter at registration
 * - 1.2 {...result.params} spread → reuse params object
 * - 1.3 #parsePath() object allocation → inline into match()
 * - 1.4 #collectConstraintPatterns() → pre-compute at registration
 * - 1.5 new Set(declaredQueryParams) → pre-compute at registration
 * - 4.1 #appendSlashChild() per match → pre-compute at registration
 *
 * IMPORTANT: match() is a non-mutating operation.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, boxplot, lineplot, summary } from "mitata";

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
  const warmupMatcher = createMatcher([
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [{ name: "view", path: "/:id" }],
    },
    { name: "search", path: "/search?q&page&sort" },
    { name: "org", path: String.raw`/org/:orgId<\d+>` },
  ]);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/");
    warmupMatcher.match("/users");
    warmupMatcher.match("/users/123");
    warmupMatcher.match("/search?q=test&page=1");
    warmupMatcher.match("/org/42");
    warmupMatcher.match("/users");
    warmupMatcher.match("/nonexistent");
  }
}

// =============================================================================
// 1. Baseline: minimal match (no params, no query, no constraints)
// Targets: #parsePath object (1.3), segments.filter (1.1)
// =============================================================================

boxplot(() => {
  summary(() => {
    const matcher = createMatcher([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "about", path: "/about" },
    ]);

    bench("hot: static shallow (/users)", () => {
      matcher.match("/users");
    });

    bench("hot: root path (/)", () => {
      matcher.match("/");
    });

    bench("hot: no match", () => {
      matcher.match("/nonexistent");
    });
  });
});

// =============================================================================
// 2. URL params: measures {...result.params} spread overhead (1.2)
// More params = more keys to copy in the spread
// =============================================================================

boxplot(() => {
  summary(() => {
    // 1 param
    const matcher1 = createMatcher([{ name: "user", path: "/users/:id" }]);

    // 3 params (nested)
    const matcher3 = createMatcher([
      {
        name: "org",
        path: "/org/:orgId",
        children: [
          {
            name: "team",
            path: "/team/:teamId",
            children: [{ name: "member", path: "/member/:memberId" }],
          },
        ],
      },
    ]);

    // 5 params (deeply nested)
    const matcher5 = createMatcher([
      {
        name: "a",
        path: "/a/:p1",
        children: [
          {
            name: "b",
            path: "/b/:p2",
            children: [
              {
                name: "c",
                path: "/c/:p3",
                children: [
                  {
                    name: "d",
                    path: "/d/:p4",
                    children: [{ name: "e", path: "/e/:p5" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    bench("hot: 1 URL param", () => {
      matcher1.match("/users/123");
    });

    bench("hot: 3 URL params (nested)", () => {
      matcher3.match("/org/acme/team/core/member/42");
    });

    bench("hot: 5 URL params (deep nested)", () => {
      matcher5.match("/a/v1/b/v2/c/v3/d/v4/e/v5");
    });
  });
});

// =============================================================================
// 3. Query params: measures #processQueryParams overhead (1.5)
// Strict mode creates new Set(declaredQueryParams) per match
// =============================================================================

barplot(() => {
  summary(() => {
    const matcher = createMatcher([
      { name: "search", path: "/search?q&page&sort&filter&limit" },
    ]);

    const matcherStrict = createMatcher(
      [{ name: "search", path: "/search?q&page&sort&filter&limit" }],
      { strictQueryParams: true },
    );

    bench("hot: query default (2 params)", () => {
      matcher.match("/search?q=test&page=1");
    });

    bench("hot: query default (5 params)", () => {
      matcher.match("/search?q=test&page=1&sort=date&filter=active&limit=10");
    });

    bench("hot: query strict (5 params)", () => {
      matcherStrict.match(
        "/search?q=test&page=1&sort=date&filter=active&limit=10",
      );
    });

    bench("hot: query default (5+2 extra params)", () => {
      matcher.match(
        "/search?q=test&page=1&sort=date&filter=active&limit=10&extra1=a&extra2=b",
      );
    });
  });
});

// =============================================================================
// 4. Constraints: measures #collectConstraintPatterns overhead (1.4)
// =============================================================================

barplot(() => {
  summary(() => {
    const matcherNoConstraint = createMatcher([
      { name: "user", path: "/users/:id" },
    ]);

    const matcherWithConstraint = createMatcher([
      { name: "user", path: String.raw`/users/:id<\d+>` },
    ]);

    const matcherMultiConstraint = createMatcher([
      {
        name: "resource",
        path: String.raw`/org/:orgId<\d+>`,
        children: [{ name: "item", path: String.raw`/:slug<[a-z][a-z0-9-]*>` }],
      },
    ]);

    bench("hot: no constraints", () => {
      matcherNoConstraint.match("/users/123");
    });

    bench("hot: 1 constraint (numeric)", () => {
      matcherWithConstraint.match("/users/123");
    });

    bench("hot: 2 constraints (nested)", () => {
      matcherMultiConstraint.match("/org/42/test-slug");
    });
  });
});

// =============================================================================
// 5. Depth scaling: measures per-segment overhead
// Each additional level adds: segment processing + slashChild check (4.1)
// =============================================================================

lineplot(() => {
  summary(() => {
    // Depth 1
    const d1 = createMatcher([{ name: "a", path: "/a" }]);

    // Depth 3
    const d3 = createMatcher([
      {
        name: "a",
        path: "/a",
        children: [
          {
            name: "b",
            path: "/b",
            children: [{ name: "c", path: "/c" }],
          },
        ],
      },
    ]);

    // Depth 5
    const d5 = createMatcher([
      {
        name: "a",
        path: "/a",
        children: [
          {
            name: "b",
            path: "/b",
            children: [
              {
                name: "c",
                path: "/c",
                children: [
                  {
                    name: "d",
                    path: "/d",
                    children: [{ name: "e", path: "/e" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    bench("hot: depth 1 (static)", () => {
      d1.match("/a");
    });

    bench("hot: depth 3 (static)", () => {
      d3.match("/a/b/c");
    });

    bench("hot: depth 5 (static)", () => {
      d5.match("/a/b/c/d/e");
    });
  });
});

// =============================================================================
// 6. Slash child: measures #appendSlashChild overhead (4.1)
// Route with child path="/" triggers slashChild logic
// =============================================================================

barplot(() => {
  summary(() => {
    // Without slash child
    const matcherNoSlash = createMatcher([
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
    ]);

    // With slash child (path="/")
    const matcherWithSlash = createMatcher([
      {
        name: "users",
        path: "/users",
        children: [
          { name: "list", path: "/" },
          { name: "view", path: "/:id" },
        ],
      },
    ]);

    bench("hot: parent match (no slash child)", () => {
      matcherNoSlash.match("/users");
    });

    bench("hot: parent match (with slash child)", () => {
      matcherWithSlash.match("/users");
    });
  });
});

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
