// packages/route-tree/tests/benchmarks/buildPathFromPattern.bench.ts

/**
 * Benchmark: buildPathFromPattern standalone functions
 *
 * Tests the R4 optimization as standalone API:
 * - compilePathPattern: one-time compilation cost
 * - buildFromPattern: hot path performance
 *
 * Use cases:
 * - Standalone path building (without full router)
 * - Pre-compilation at route registration
 * - React memoization patterns
 * - SSR/SSG batch URL generation
 */

import { bench, boxplot, run, summary } from "mitata";

import {
  buildFromPattern,
  type CompiledPathPattern,
  compilePathPattern,
} from "../../modules/parser/path-parser/buildPathFromPattern";

// =============================================================================
// Test Data
// =============================================================================

// Pattern complexity levels
const PATTERNS = {
  static: "/users",
  simple: "/users/:id",
  medium: "/users/:userId/posts/:postId",
  complex: "/api/:version/:resource/:id/:action",
  deep: "/a/:p1/b/:p2/c/:p3/d/:p4/e/:p5/f/:p6/g/:p7/h/:p8/i/:p9/j/:p10",
  matrix: "/users/:id;version=",
  wildcard: "/files/*path",
  mixed: "/api/:version/files/*path",
};

// Pre-compiled patterns (simulates route registration)
const COMPILED: Record<string, CompiledPathPattern> = {
  static: compilePathPattern(PATTERNS.static),
  simple: compilePathPattern(PATTERNS.simple),
  medium: compilePathPattern(PATTERNS.medium),
  complex: compilePathPattern(PATTERNS.complex),
  deep: compilePathPattern(PATTERNS.deep),
  matrix: compilePathPattern(PATTERNS.matrix),
  wildcard: compilePathPattern(PATTERNS.wildcard),
  mixed: compilePathPattern(PATTERNS.mixed),
};

// Parameter sets
const PARAMS = {
  none: {},
  simple: { id: "123" },
  medium: { userId: "123", postId: "456" },
  complex: { version: "v2", resource: "users", id: "123", action: "update" },
  deep: {
    p1: "v1",
    p2: "v2",
    p3: "v3",
    p4: "v4",
    p5: "v5",
    p6: "v6",
    p7: "v7",
    p8: "v8",
    p9: "v9",
    p10: "v10",
  },
  matrix: { id: "123", version: "2" },
  wildcard: { path: "docs/readme.md" },
  mixed: { version: "v1", path: "images/logo.png" },
};

// Long values for stress testing
const LONG_PARAMS = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  userId: "user_2NxK9JmZ8qLpR4sT5vWxY1aB3cD4eF",
  postId: "post_7GhI8jKl9MnO0pQr1StU2VwX3YzA4bC",
};

// =============================================================================
// Category 1: compilePathPattern (one-time cost)
// =============================================================================

boxplot(() => {
  summary(() => {
    bench("compile: static (/users)", () => {
      compilePathPattern(PATTERNS.static);
    });

    bench("compile: simple (1 param)", () => {
      compilePathPattern(PATTERNS.simple);
    });

    bench("compile: medium (2 params)", () => {
      compilePathPattern(PATTERNS.medium);
    });

    bench("compile: complex (4 params)", () => {
      compilePathPattern(PATTERNS.complex);
    });

    bench("compile: deep (10 params)", () => {
      compilePathPattern(PATTERNS.deep);
    });
  });
});

// =============================================================================
// Category 2: buildFromPattern (hot path)
// =============================================================================

boxplot(() => {
  summary(() => {
    bench("build: static (0 params)", () => {
      buildFromPattern(COMPILED.static, PARAMS.none);
    });

    bench("build: simple (1 param)", () => {
      buildFromPattern(COMPILED.simple, PARAMS.simple);
    });

    bench("build: medium (2 params)", () => {
      buildFromPattern(COMPILED.medium, PARAMS.medium);
    });

    bench("build: complex (4 params)", () => {
      buildFromPattern(COMPILED.complex, PARAMS.complex);
    });

    bench("build: deep (10 params)", () => {
      buildFromPattern(COMPILED.deep, PARAMS.deep);
    });
  });
});

// =============================================================================
// Category 3: Special patterns
// =============================================================================

boxplot(() => {
  summary(() => {
    bench("build: matrix param", () => {
      buildFromPattern(COMPILED.matrix, PARAMS.matrix);
    });

    bench("build: wildcard", () => {
      buildFromPattern(COMPILED.wildcard, PARAMS.wildcard);
    });

    bench("build: mixed (param + wildcard)", () => {
      buildFromPattern(COMPILED.mixed, PARAMS.mixed);
    });
  });
});

// =============================================================================
// Category 5: Repeated builds (React/SSR pattern)
// =============================================================================

boxplot(() => {
  summary(() => {
    // Simulate: rendering 10 links with same route pattern
    bench("batch: 10 builds (pre-compiled)", () => {
      for (let i = 0; i < 10; i++) {
        buildFromPattern(COMPILED.medium, { userId: String(i), postId: "1" });
      }
    });
  });
});

// =============================================================================
// Category 6: Long parameter values
// =============================================================================

boxplot(() => {
  summary(() => {
    bench("long values: short params", () => {
      buildFromPattern(COMPILED.medium, PARAMS.medium);
    });

    bench("long values: UUID-like params", () => {
      buildFromPattern(COMPILED.medium, {
        userId: LONG_PARAMS.userId,
        postId: LONG_PARAMS.postId,
      });
    });
  });
});

// =============================================================================
// Category 7: Real-world API patterns
// =============================================================================

const API_PATTERNS = {
  rest: compilePathPattern("/api/:version/:resource/:id"),
  nested: compilePathPattern(
    "/users/:userId/posts/:postId/comments/:commentId",
  ),
  query: compilePathPattern("/search/:category"),
};

boxplot(() => {
  summary(() => {
    bench("api: REST endpoint", () => {
      buildFromPattern(API_PATTERNS.rest, {
        version: "v2",
        resource: "users",
        id: "123",
      });
    });

    bench("api: nested resource", () => {
      buildFromPattern(API_PATTERNS.nested, {
        userId: "123",
        postId: "456",
        commentId: "789",
      });
    });

    bench("api: simple with query intent", () => {
      buildFromPattern(API_PATTERNS.query, { category: "electronics" });
    });
  });
});

void run();
