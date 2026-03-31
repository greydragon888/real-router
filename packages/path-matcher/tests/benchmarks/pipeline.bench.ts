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

import { SegmentMatcher } from "../../src";
import { buildTree, createMatcher } from "./helpers/buildTree";

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

const splatRoutes: SimpleRoute[] = [
  { name: "home", path: "/" },
  {
    name: "files",
    path: "/files",
    children: [
      { name: "docs", path: "/docs" },
      { name: "catch", path: "/*path" },
    ],
  },
];

const constraintRoutes: SimpleRoute[] = [
  { name: "home", path: "/" },
  {
    name: "org",
    path: String.raw`/org/:orgId<\d+>`,
    children: [{ name: "item", path: String.raw`/:slug<[a-z][a-z0-9-]*>` }],
  },
];

// =============================================================================
// JIT Warmup: Pre-warm all code paths
// =============================================================================
{
  const warmupMatcher = createMatcher([
    ...standardRoutes,
    { name: "article", path: "/articles/:id?/:slug?" },
    { name: "search", path: "/search?q&page" },
    { name: "files", path: "/files/*path" },
  ]);

  const warmupEncoding = createMatcher([{ name: "user", path: "/users/:id" }], {
    urlParamsEncoding: "uriComponent",
  });

  const warmupRootPath = createMatcher(standardRoutes);

  warmupRootPath.setRootPath("/app");

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/about");
    warmupMatcher.match("/users/123");
    warmupMatcher.match("/users/123/profile");
    warmupMatcher.match("/articles");
    warmupMatcher.match("/articles/42/hello");
    warmupMatcher.match("/search?q=test&page=1");
    warmupMatcher.match("/files/docs/readme.md");

    warmupMatcher.buildPath("about");
    warmupMatcher.buildPath("user", { id: "123" });
    warmupMatcher.buildPath("users.profile", { id: "123" });
    warmupMatcher.buildPath("article", {});
    warmupMatcher.buildPath("article", { id: "42", slug: "hello" });
    warmupMatcher.buildPath("files", { path: "docs/readme.md" });
    warmupMatcher.buildPath("about", {}, { trailingSlash: "always" });

    warmupEncoding.match("/users/hello%20world");
    warmupEncoding.buildPath("user", { id: "hello world" });

    warmupRootPath.match("/app/about");
    warmupRootPath.buildPath("about");
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

// =============================================================================
// 4. Splat pipeline
//    Splat params require per-segment encoding in buildPath
//    and backtracking logic in match.
// =============================================================================

boxplot(() => {
  summary(() => {
    const matcher = createMatcher(splatRoutes);

    bench("splat-pipeline: static child match + buildPath", () => {
      const result = matcher.match("/files/docs");

      if (result) {
        do_not_optimize(matcher.buildPath("files.docs"));
      }
    });

    bench("splat-pipeline: shallow splat (1 segment)", () => {
      const result = matcher.match("/files/readme.md");

      if (result) {
        do_not_optimize(
          matcher.buildPath(
            "files.catch",
            result.params as Record<string, string>,
          ),
        );
      }
    });

    bench("splat-pipeline: deep splat (3 segments)", () => {
      const result = matcher.match("/files/a/b/c.txt");

      if (result) {
        do_not_optimize(
          matcher.buildPath(
            "files.catch",
            result.params as Record<string, string>,
          ),
        );
      }
    });

    bench("splat-pipeline: deep splat (5 segments)", () => {
      const result = matcher.match("/files/a/b/c/d/e.txt");

      if (result) {
        do_not_optimize(
          matcher.buildPath(
            "files.catch",
            result.params as Record<string, string>,
          ),
        );
      }
    });
  });
});

// =============================================================================
// 5. Encoding strategies: same route, different urlParamsEncoding
//    Measures the cost difference between 4 encoding strategies.
// =============================================================================

barplot(() => {
  summary(() => {
    const encodingDefault = createMatcher(
      [{ name: "user", path: "/users/:id" }],
      { urlParamsEncoding: "default" },
    );

    const encodingUri = createMatcher([{ name: "user", path: "/users/:id" }], {
      urlParamsEncoding: "uri",
    });

    const encodingComponent = createMatcher(
      [{ name: "user", path: "/users/:id" }],
      { urlParamsEncoding: "uriComponent" },
    );

    const encodingNone = createMatcher([{ name: "user", path: "/users/:id" }], {
      urlParamsEncoding: "none",
    });

    const encodedPath = "/users/hello%20world";

    bench("encoding: default (match encoded)", () => {
      do_not_optimize(encodingDefault.match(encodedPath));
    });

    bench("encoding: uri (match encoded)", () => {
      do_not_optimize(encodingUri.match(encodedPath));
    });

    bench("encoding: uriComponent (match encoded)", () => {
      do_not_optimize(encodingComponent.match(encodedPath));
    });

    bench("encoding: none (match encoded)", () => {
      do_not_optimize(encodingNone.match(encodedPath));
    });
  });
});

barplot(() => {
  summary(() => {
    const encodingDefault = createMatcher(
      [{ name: "user", path: "/users/:id" }],
      { urlParamsEncoding: "default" },
    );

    const encodingUri = createMatcher([{ name: "user", path: "/users/:id" }], {
      urlParamsEncoding: "uri",
    });

    const encodingComponent = createMatcher(
      [{ name: "user", path: "/users/:id" }],
      { urlParamsEncoding: "uriComponent" },
    );

    const encodingNone = createMatcher([{ name: "user", path: "/users/:id" }], {
      urlParamsEncoding: "none",
    });

    bench("encoding: default (buildPath)", () => {
      do_not_optimize(encodingDefault.buildPath("user", { id: "hello world" }));
    });

    bench("encoding: uri (buildPath)", () => {
      do_not_optimize(encodingUri.buildPath("user", { id: "hello world" }));
    });

    bench("encoding: uriComponent (buildPath)", () => {
      do_not_optimize(
        encodingComponent.buildPath("user", { id: "hello world" }),
      );
    });

    bench("encoding: none (buildPath)", () => {
      do_not_optimize(encodingNone.buildPath("user", { id: "hello world" }));
    });
  });
});

// =============================================================================
// 6. buildPath: trailing slash modes
// =============================================================================

barplot(() => {
  summary(() => {
    const matcher = createMatcher(standardRoutes);

    bench("buildPath: trailingSlash default", () => {
      do_not_optimize(matcher.buildPath("user", { id: "123" }));
    });

    bench("buildPath: trailingSlash always", () => {
      do_not_optimize(
        matcher.buildPath("user", { id: "123" }, { trailingSlash: "always" }),
      );
    });

    bench("buildPath: trailingSlash never", () => {
      do_not_optimize(
        matcher.buildPath("user", { id: "123" }, { trailingSlash: "never" }),
      );
    });
  });
});

// =============================================================================
// 7. buildPath: constraint validation overhead
//    Constraint validation runs before path building.
// =============================================================================

barplot(() => {
  summary(() => {
    const matcherNoConstraint = createMatcher([
      { name: "item", path: "/org/:orgId/:slug" },
    ]);

    const matcherWithConstraint = createMatcher(constraintRoutes);

    bench("buildPath: no constraints", () => {
      do_not_optimize(
        matcherNoConstraint.buildPath("item", {
          orgId: "42",
          slug: "test-item",
        }),
      );
    });

    bench("buildPath: 2 constraints", () => {
      do_not_optimize(
        matcherWithConstraint.buildPath("org.item", {
          orgId: "42",
          slug: "test-item",
        }),
      );
    });
  });
});

// =============================================================================
// 8. rootPath: pipeline overhead when rootPath is set
//    match() strips prefix, buildPath() prepends it.
// =============================================================================

barplot(() => {
  summary(() => {
    const matcherNoRoot = createMatcher(standardRoutes);

    const tree = buildTree(standardRoutes);
    const matcherWithRoot = new SegmentMatcher();

    matcherWithRoot.registerTree(tree);
    matcherWithRoot.setRootPath("/app");

    const deepTree = buildTree([
      {
        name: "a",
        path: "/a/:p1",
        children: [
          {
            name: "b",
            path: "/b/:p2",
            children: [{ name: "c", path: "/c/:p3" }],
          },
        ],
      },
    ]);
    const matcherDeepRoot = new SegmentMatcher();

    matcherDeepRoot.registerTree(deepTree);
    matcherDeepRoot.setRootPath("/base/app");

    bench("rootPath: match without rootPath", () => {
      do_not_optimize(matcherNoRoot.match("/users/123"));
    });

    bench("rootPath: match with rootPath /app", () => {
      do_not_optimize(matcherWithRoot.match("/app/users/123"));
    });

    bench("rootPath: buildPath without rootPath", () => {
      do_not_optimize(matcherNoRoot.buildPath("user", { id: "123" }));
    });

    bench("rootPath: buildPath with rootPath /app", () => {
      do_not_optimize(matcherWithRoot.buildPath("user", { id: "123" }));
    });

    bench("rootPath: deep match with rootPath /base/app", () => {
      do_not_optimize(matcherDeepRoot.match("/base/app/a/v1/b/v2/c/v3"));
    });
  });
});
