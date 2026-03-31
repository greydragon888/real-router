/**
 * Advanced Path Pattern Benchmarks
 *
 * Tests patterns missing from other benchmark files:
 * - Optional params (/:id?)
 * - Splat/wildcard (*path)
 * - Constraint params (/:id<\d+>)
 * - Percent-encoded URLs
 * - urlParamsEncoding modes
 * - caseSensitive mode
 *
 * IMPORTANT: match()/buildPath() are non-mutating operations.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, do_not_optimize, summary } from "mitata";

import { createRouteTree } from "../../src/builder";
import { createMatcher as createMatcherFactory } from "../../src/createMatcher";

import type { Matcher } from "../../src/createMatcher";
import type { RouteDefinition } from "../../src/types";

function createMatcher(
  routes: RouteDefinition[],
  options?: Parameters<typeof createMatcherFactory>[0],
): Matcher {
  const tree = createRouteTree("", "", routes);
  const matcher = createMatcherFactory(options);

  matcher.registerTree(tree);

  return matcher;
}

// =============================================================================
// JIT Warmup
// =============================================================================
{
  const warmupRoutes: RouteDefinition[] = [
    { name: "home", path: "/" },
    { name: "user", path: "/users/:id" },
    { name: "userOpt", path: "/profiles/:id?" },
    { name: "files", path: "/files/*path" },
    { name: "article", path: String.raw`/articles/:id<\d+>` },
  ];
  const warmupMatcher = createMatcher(warmupRoutes);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/users/123");
    warmupMatcher.match("/profiles");
    warmupMatcher.match("/profiles/456");
    warmupMatcher.match("/files/docs/readme.md");
    warmupMatcher.match("/articles/42");
    warmupMatcher.buildPath("user", { id: "123" });
    warmupMatcher.buildPath("userOpt");
    warmupMatcher.buildPath("userOpt", { id: "456" });
    warmupMatcher.buildPath("files", { path: "docs/readme.md" });
    warmupMatcher.buildPath("article", { id: "42" });
  }
}

// =============================================================================
// 1. Optional params: match + buildPath with /:id?
// =============================================================================

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [
      { name: "required", path: "/users/:id" },
      { name: "optional", path: "/profiles/:id?" },
    ];
    const matcher = createMatcher(routes);

    bench("match: required param (/users/123)", () => {
      do_not_optimize(matcher.match("/users/123"));
    });

    bench("match: optional param present (/profiles/456)", () => {
      do_not_optimize(matcher.match("/profiles/456"));
    });

    bench("match: optional param absent (/profiles)", () => {
      do_not_optimize(matcher.match("/profiles"));
    });
  });
});

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [
      { name: "required", path: "/users/:id" },
      { name: "optional", path: "/profiles/:id?" },
    ];
    const matcher = createMatcher(routes);

    bench("buildPath: required param", () => {
      do_not_optimize(matcher.buildPath("required", { id: "123" }));
    });

    bench("buildPath: optional param present", () => {
      do_not_optimize(matcher.buildPath("optional", { id: "456" }));
    });

    bench("buildPath: optional param absent", () => {
      do_not_optimize(matcher.buildPath("optional"));
    });
  });
});

// =============================================================================
// 2. Splat/wildcard: match + buildPath with *path
// =============================================================================

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [
      { name: "static", path: "/docs/readme" },
      { name: "param", path: "/users/:id" },
      { name: "splat", path: "/files/*path" },
    ];
    const matcher = createMatcher(routes);

    bench("match: static path", () => {
      do_not_optimize(matcher.match("/docs/readme"));
    });

    bench("match: single param", () => {
      do_not_optimize(matcher.match("/users/123"));
    });

    bench("match: splat short (/files/doc.txt)", () => {
      do_not_optimize(matcher.match("/files/doc.txt"));
    });

    bench("match: splat deep (/files/a/b/c/d.md)", () => {
      do_not_optimize(matcher.match("/files/a/b/c/d.md"));
    });
  });
});

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [{ name: "splat", path: "/files/*path" }];
    const matcher = createMatcher(routes);

    bench("buildPath: splat short", () => {
      do_not_optimize(matcher.buildPath("splat", { path: "doc.txt" }));
    });

    bench("buildPath: splat deep path", () => {
      do_not_optimize(
        matcher.buildPath("splat", { path: "a/b/c/d/readme.md" }),
      );
    });
  });
});

// =============================================================================
// 3. Constraint params: match with /:id<\d+>
// =============================================================================

barplot(() => {
  summary(() => {
    const routesNoConstraint: RouteDefinition[] = [
      { name: "article", path: "/articles/:id" },
    ];
    const routesWithConstraint: RouteDefinition[] = [
      { name: "article", path: String.raw`/articles/:id<\d+>` },
    ];
    const matcherPlain = createMatcher(routesNoConstraint);
    const matcherConstrained = createMatcher(routesWithConstraint);

    bench("match: param without constraint", () => {
      do_not_optimize(matcherPlain.match("/articles/42"));
    });

    bench(String.raw`match: param with \d+ constraint`, () => {
      do_not_optimize(matcherConstrained.match("/articles/42"));
    });
  });
});

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [
      { name: "simple", path: String.raw`/items/:id<\d+>` },
      {
        name: "uuid",
        path: "/entities/:id<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}>",
      },
    ];
    const matcher = createMatcher(routes);

    bench(String.raw`match: simple \d+ constraint`, () => {
      do_not_optimize(matcher.match("/items/42"));
    });

    bench("match: UUID constraint", () => {
      do_not_optimize(
        matcher.match("/entities/550e8400-e29b-41d4-a716-446655440000"),
      );
    });
  });
});

// =============================================================================
// 4. Percent-encoded URLs
// =============================================================================

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [
      { name: "user", path: "/users/:name" },
      { name: "search", path: "/search?q" },
    ];
    const matcher = createMatcher(routes);

    bench("match: ASCII param (/users/john)", () => {
      do_not_optimize(matcher.match("/users/john"));
    });

    bench("match: encoded param (/users/John%20Doe)", () => {
      do_not_optimize(matcher.match("/users/John%20Doe"));
    });

    bench(
      "match: encoded query (?q=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82)",
      () => {
        do_not_optimize(
          matcher.match("/search?q=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82"),
        );
      },
    );
  });
});

// =============================================================================
// 5. urlParamsEncoding modes comparison
// =============================================================================

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [{ name: "user", path: "/users/:name" }];

    const matcherDefault = createMatcher(routes, {
      urlParamsEncoding: "default",
    });
    const matcherUri = createMatcher(routes, { urlParamsEncoding: "uri" });
    const matcherUriComponent = createMatcher(routes, {
      urlParamsEncoding: "uriComponent",
    });
    const matcherNone = createMatcher(routes, { urlParamsEncoding: "none" });

    const encodedPath = "/users/John%20Doe";

    bench("encoding default: match", () => {
      do_not_optimize(matcherDefault.match(encodedPath));
    });

    bench("encoding uri: match", () => {
      do_not_optimize(matcherUri.match(encodedPath));
    });

    bench("encoding uriComponent: match", () => {
      do_not_optimize(matcherUriComponent.match(encodedPath));
    });

    bench("encoding none: match", () => {
      do_not_optimize(matcherNone.match(encodedPath));
    });
  });
});

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [{ name: "user", path: "/users/:name" }];

    const matcherDefault = createMatcher(routes, {
      urlParamsEncoding: "default",
    });
    const matcherUri = createMatcher(routes, { urlParamsEncoding: "uri" });
    const matcherUriComponent = createMatcher(routes, {
      urlParamsEncoding: "uriComponent",
    });
    const matcherNone = createMatcher(routes, { urlParamsEncoding: "none" });

    const params = { name: "John Doe" };

    bench("encoding default: buildPath", () => {
      do_not_optimize(matcherDefault.buildPath("user", params));
    });

    bench("encoding uri: buildPath", () => {
      do_not_optimize(matcherUri.buildPath("user", params));
    });

    bench("encoding uriComponent: buildPath", () => {
      do_not_optimize(matcherUriComponent.buildPath("user", params));
    });

    bench("encoding none: buildPath", () => {
      do_not_optimize(matcherNone.buildPath("user", params));
    });
  });
});

// =============================================================================
// 6. caseSensitive mode comparison
// =============================================================================

barplot(() => {
  summary(() => {
    const routes: RouteDefinition[] = [
      { name: "users", path: "/Users/:id" },
      {
        name: "admin",
        path: "/Admin",
        children: [
          { name: "dashboard", path: "/Dashboard" },
          { name: "settings", path: "/Settings" },
        ],
      },
    ];

    const matcherSensitive = createMatcher(routes, { caseSensitive: true });
    const matcherInsensitive = createMatcher(routes, { caseSensitive: false });

    bench("caseSensitive true: match", () => {
      do_not_optimize(matcherSensitive.match("/Users/123"));
    });

    bench("caseSensitive false: match", () => {
      do_not_optimize(matcherInsensitive.match("/users/123"));
    });

    bench("caseSensitive true: deep match", () => {
      do_not_optimize(matcherSensitive.match("/Admin/Dashboard"));
    });

    bench("caseSensitive false: deep match", () => {
      do_not_optimize(matcherInsensitive.match("/admin/dashboard"));
    });
  });
});
