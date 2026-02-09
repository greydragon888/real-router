/**
 * match + buildPath Pipeline Benchmarks
 *
 * Measures the combined cost of match() → buildPath() pipeline,
 * which simulates what RoutesNamespace.matchPath() actually does.
 *
 * Also tests optional params matching and match vs pipeline isolation.
 *
 * IMPORTANT: All operations are non-mutating after setup.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, boxplot, do_not_optimize, summary } from "mitata";

import { createMatcher } from "./helpers/buildTree";

import type { SimpleRoute } from "./helpers/buildTree";

// =============================================================================
// Route fixtures
// =============================================================================

const standardRoutes: SimpleRoute[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id/profile" }],
  },
];

const optionalRoutes: SimpleRoute[] = [
  { name: "home", path: "/" },
  { name: "user", path: "/users/:id" },
  { name: "article", path: "/articles/:id?/:slug?" },
];

const queryRoutes: SimpleRoute[] = [
  { name: "home", path: "/" },
  { name: "search", path: "/search?q&page&sort" },
  { name: "user", path: "/users/:id?tab" },
];

// =============================================================================
// JIT Warmup: Pre-warm all code paths
// =============================================================================
{
  const warmupMatcher = createMatcher([
    ...standardRoutes,
    { name: "article", path: "/articles/:id?/:slug?" },
    { name: "search", path: "/search?q&page" },
  ]);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/about");
    warmupMatcher.match("/users/123");
    warmupMatcher.match("/users/123/profile");
    warmupMatcher.match("/articles");
    warmupMatcher.match("/articles/42/hello");
    warmupMatcher.match("/search?q=test&page=1");

    warmupMatcher.buildPath("about");
    warmupMatcher.buildPath("user", { id: "123" });
    warmupMatcher.buildPath("users.profile", { id: "123" });
    warmupMatcher.buildPath("article", {});
    warmupMatcher.buildPath("article", { id: "42", slug: "hello" });
  }
}

// =============================================================================
// 1. matchPath + buildPath pipeline
//    match(path) -> extract name + params -> buildPath(name, params)
//    Measures the combined cost of the two operations.
// =============================================================================

boxplot(() => {
  summary(() => {
    const matcher = createMatcher(standardRoutes);

    // Static path: match hits static cache, buildPath uses static template
    bench("pipeline: static (/about)", () => {
      const result = matcher.match("/about");

      if (result) {
        matcher.buildPath("about");
      }
    });

    // Param path: trie traversal + template fill
    bench("pipeline: 1 param (/users/123)", () => {
      const result = matcher.match("/users/123");

      if (result) {
        matcher.buildPath("user", result.params as Record<string, string>);
      }
    });

    // Nested path with params
    bench("pipeline: nested (/users/123/profile)", () => {
      const result = matcher.match("/users/123/profile");

      if (result) {
        matcher.buildPath(
          "users.profile",
          result.params as Record<string, string>,
        );
      }
    });
  });
});

// Pipeline with query params
barplot(() => {
  summary(() => {
    const matcher = createMatcher(queryRoutes);

    bench("pipeline: query (/search?q=test&page=1)", () => {
      const result = matcher.match("/search?q=test&page=1");

      if (result) {
        matcher.buildPath("search", result.params as Record<string, string>);
      }
    });

    bench("pipeline: param+query (/users/123?tab=info)", () => {
      const result = matcher.match("/users/123?tab=info");

      if (result) {
        matcher.buildPath("user", result.params as Record<string, string>);
      }
    });
  });
});

// =============================================================================
// 2. match() vs pipeline: isolate buildPath overhead
//    Same path, with and without buildPath -- shows the exact cost of rewrite.
// =============================================================================

barplot(() => {
  summary(() => {
    const matcher = createMatcher(standardRoutes);

    bench("match-only: nested (/users/123/profile)", () => {
      do_not_optimize(matcher.match("/users/123/profile"));
    });

    bench("pipeline: nested (/users/123/profile)", () => {
      const result = matcher.match("/users/123/profile");

      if (result) {
        do_not_optimize(
          matcher.buildPath(
            "users.profile",
            result.params as Record<string, string>,
          ),
        );
      }
    });

    bench("buildPath-only: nested (users.profile)", () => {
      do_not_optimize(matcher.buildPath("users.profile", { id: "123" }));
    });
  });
});

// =============================================================================
// 3. Optional params matching
//    Tests trie branch exploration for optional segments.
// =============================================================================

boxplot(() => {
  summary(() => {
    const matcher = createMatcher(optionalRoutes);

    // No optional params provided -- trie must try param branch then fallback
    bench("optional: match without params (/articles)", () => {
      matcher.match("/articles");
    });

    // One optional param
    bench("optional: match with 1 param (/articles/42)", () => {
      matcher.match("/articles/42");
    });

    // All optional params
    bench("optional: match with all params (/articles/42/hello)", () => {
      matcher.match("/articles/42/hello");
    });

    // Pipeline: match + buildPath for optional params
    bench("optional: pipeline without params", () => {
      const result = matcher.match("/articles");

      if (result) {
        matcher.buildPath("article", result.params as Record<string, string>);
      }
    });

    bench("optional: pipeline with all params", () => {
      const result = matcher.match("/articles/42/hello");

      if (result) {
        matcher.buildPath("article", result.params as Record<string, string>);
      }
    });
  });
});
