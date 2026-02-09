/**
 * Path Matcher Stress Tests
 *
 * Tests performance under extreme conditions:
 * 1. Wide tree scaling
 * 2. Deep tree scaling
 * 3. Many URL params
 * 4. Long paths
 * 5. Constraint-heavy routes
 * 6. Large registration
 * 7. Cache effectiveness
 * 8. Worst-case no-match
 *
 * IMPORTANT: match() is a non-mutating operation.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, do_not_optimize, lineplot, summary } from "mitata";

import { SegmentMatcher } from "../../src";
import { buildTree, createMatcher } from "./helpers/buildTree";

import type { SimpleRoute } from "./helpers/buildTree";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// =============================================================================
// Helper generators
// =============================================================================

function generateWideRoutes(count: number): SimpleRoute[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));
}

function generateDeepRoute(depth: number): SimpleRoute[] {
  let current: SimpleRoute = { name: `l${depth - 1}`, path: `/l${depth - 1}` };

  for (let i = depth - 2; i >= 0; i--) {
    current = { name: `l${i}`, path: `/l${i}`, children: [current] };
  }

  return [current];
}

function generateDeepPath(depth: number): string {
  return Array.from({ length: depth }, (_, i) => `/l${i}`).join("");
}

function generateParamRoute(paramCount: number): SimpleRoute[] {
  const segments = Array.from(
    { length: paramCount },
    (_, i) => `/s${i}/:p${i}`,
  ).join("");

  return [{ name: "target", path: segments }];
}

function generateParamPath(paramCount: number): string {
  return Array.from({ length: paramCount }, (_, i) => `/s${i}/v${i}`).join("");
}

function generateLongPath(segmentCount: number): string {
  return Array.from({ length: segmentCount }, (_, i) => `/seg${i}`).join("");
}

function generateLongRoute(segmentCount: number): SimpleRoute[] {
  const path = Array.from({ length: segmentCount }, (_, i) => `/seg${i}`).join(
    "",
  );

  return [{ name: "target", path }];
}

// =============================================================================
// JIT Warmup
// =============================================================================
{
  const warmupMatcher = createMatcher([
    { name: "a", path: "/a" },
    { name: "b", path: "/b/:id" },
    { name: "c", path: String.raw`/c/:id<\d+>` },
  ]);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/a");
    warmupMatcher.match("/b/1");
    warmupMatcher.match("/c/1");
    warmupMatcher.match("/nonexistent");
  }
}

// =============================================================================
// 1. Wide tree scaling
//    lineplot [10, 50, 100, 500, 1000] static routes, match middle
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: wide $count routes", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateWideRoutes(count);
      const matcher = createMatcher(routes);
      const targetPath = `/route${Math.floor(count / 2)}`;

      yield () => {
        do_not_optimize(matcher.match(targetPath));
      };
    }).args("count", [10, 50, 100, 500, 1000]);
  });
});

// =============================================================================
// 2. Deep tree scaling
//    lineplot [5, 10, 20, 50] levels, match deepest
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: deep $depth levels", function* (state: BenchState) {
      const depth = state.get("depth") as number;
      const routes = generateDeepRoute(depth);
      const matcher = createMatcher(routes);
      const targetPath = generateDeepPath(depth);

      yield () => {
        do_not_optimize(matcher.match(targetPath));
      };
    }).args("depth", [5, 10, 20, 50]);
  });
});

// =============================================================================
// 3. Many URL params
//    lineplot [1, 5, 10, 20] params per route
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: $count URL params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateParamRoute(count);
      const matcher = createMatcher(routes);
      const targetPath = generateParamPath(count);

      yield () => {
        do_not_optimize(matcher.match(targetPath));
      };
    }).args("count", [1, 5, 10, 20]);
  });
});

// =============================================================================
// 4. Long paths
//    lineplot [5, 10, 20, 50] segments
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: $count segments", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateLongRoute(count);
      const matcher = createMatcher(routes);
      const targetPath = generateLongPath(count);

      yield () => {
        do_not_optimize(matcher.match(targetPath));
      };
    }).args("count", [5, 10, 20, 50]);
  });
});

// =============================================================================
// 5. Constraint-heavy routes
//    barplot [0, 1, 5, 10] constraints
// =============================================================================

barplot(() => {
  summary(() => {
    // 0 constraints
    const matcher0 = createMatcher([
      { name: "r", path: "/a/:p1/:p2/:p3/:p4/:p5" },
    ]);

    // 1 constraint
    const matcher1 = createMatcher([
      { name: "r", path: String.raw`/a/:p1<\d+>/:p2/:p3/:p4/:p5` },
    ]);

    // 5 constraints
    const matcher5 = createMatcher([
      {
        name: "r",
        path: String.raw`/a/:p1<\d+>/:p2<[a-z]+>/:p3<\d+>/:p4<[a-z]+>/:p5<\d+>`,
      },
    ]);

    const path = "/a/1/abc/2/def/3";

    bench("stress: 0 constraints (5 params)", () => {
      do_not_optimize(matcher0.match(path));
    });

    bench("stress: 1 constraint (5 params)", () => {
      do_not_optimize(matcher1.match(path));
    });

    bench("stress: 5 constraints (5 params)", () => {
      do_not_optimize(matcher5.match(path));
    });
  });
});

// =============================================================================
// 6. Large registration
//    lineplot [100, 500, 1000] total routes registerTree cost
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: registerTree $count routes", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateWideRoutes(count);
      const tree = buildTree(routes);

      yield () => {
        const matcher = new SegmentMatcher();

        matcher.registerTree(tree);
      };
    }).args("count", [100, 500, 1000]);
  });
});

// =============================================================================
// 7. Cache effectiveness
//    barplot repeated static vs varied dynamic
// =============================================================================

barplot(() => {
  summary(() => {
    const routes: SimpleRoute[] = [
      { name: "static", path: "/users" },
      { name: "dynamic", path: "/users/:id" },
    ];
    const matcher = createMatcher(routes);

    // Same static path repeatedly (should hit cache)
    bench("stress: repeated static match", () => {
      do_not_optimize(matcher.match("/users"));
    });

    // Varied dynamic paths (cache cannot help)
    let counter = 0;

    bench("stress: varied dynamic match", () => {
      do_not_optimize(matcher.match(`/users/${counter++}`));
    });
  });
});

// =============================================================================
// 8. Worst-case no-match
//    lineplot no-match in trees of [10, 100, 500, 1000] routes
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: no-match in $count routes", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateWideRoutes(count);
      const matcher = createMatcher(routes);

      yield () => {
        do_not_optimize(matcher.match("/this-path-does-not-exist"));
      };
    }).args("count", [10, 100, 500, 1000]);
  });
});
