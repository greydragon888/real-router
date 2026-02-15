/**
 * Route Tree Builder benchmarks
 *
 * Tests route tree construction performance:
 * - Single route
 * - Batch addition (parameterized)
 * - Nested routes (parameterized)
 * - Dot-notation
 * - Build options (skipSort, skipFreeze)
 *
 * Note: .gc("inner") is used for tests with heavy allocations to stabilize results
 *
 * API Changes from route-node:
 * - Old: node.add(route) - mutable
 * - New: createRouteTreeBuilder().add(route).build() - immutable
 */

import { barplot, bench, lineplot, summary } from "mitata";

import { generateDeepTree, generateWideTree } from "./helpers/generators";
import { createRouteTreeBuilder } from "../../src/builder";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// =============================================================================
// JIT Warmup: Pre-warm builder code paths to stabilize RME
// Without this, build benchmarks show unstable RME (~0.5%)
// due to V8 JIT not optimizing freeze, Map/Set construction, dot-notation parsing
// =============================================================================
{
  const warmupWide = generateWideTree(50);
  const warmupDeep = generateDeepTree(5);

  for (let i = 0; i < 100; i++) {
    // Warmup: single route add + build
    createRouteTreeBuilder("", "")
      .add({ name: "users", path: "/users" })
      .build();

    // Warmup: batch addMany + build
    createRouteTreeBuilder("", "").addMany(warmupWide).build();

    // Warmup: nested routes
    createRouteTreeBuilder("", "").addMany(warmupDeep).build();

    // Warmup: build options (skipFreeze)
    createRouteTreeBuilder("", "")
      .addMany(warmupWide)
      .build({ skipFreeze: true });

    // Warmup: incremental add
    const builder = createRouteTreeBuilder("", "");

    for (const route of warmupWide) {
      builder.add(route);
    }

    builder.build();
  }
}

// 3.1 Single route addition - barplot for validation comparison
barplot(() => {
  summary(() => {
    bench("build: single route", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .add({ name: "users", path: "/users" })
          .build();
      };
    }).gc("inner");
  });
});

// 3.2 Batch route addition - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("build: batch $count routes", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateWideTree(count);

      yield () => {
        createRouteTreeBuilder("", "").addMany(routes).build();
      };
    })
      .args("count", [10, 50, 100])
      .gc("inner");
  });
});

// 3.3 Nested route addition - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("build: nested $levels levels", function* (state: BenchState) {
      const levels = state.get("levels") as number;
      const routes = generateDeepTree(levels);

      yield () => {
        createRouteTreeBuilder("", "").addMany(routes).build();
      };
    })
      .args("levels", [3, 5, 10])
      .gc("inner");
  });
});

// 3.4 Build options comparison - barplot
barplot(() => {
  summary(() => {
    const routes = generateWideTree(50);

    bench("build: 50 routes (default)", function* () {
      yield () => {
        createRouteTreeBuilder("", "").addMany(routes).build();
      };
    }).gc("inner");

    bench("build: 50 routes skipSort", function* () {
      yield () => {
        createRouteTreeBuilder("", "").addMany(routes).build({});
      };
    }).gc("inner");

    bench("build: 50 routes skipFreeze", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .addMany(routes)
          .build({ skipFreeze: true });
      };
    }).gc("inner");

    bench("build: 50 routes all skip options", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .addMany(routes)
          .build({ skipFreeze: true });
      };
    }).gc("inner");
  });
});

// 3.5 Incremental add vs addMany - barplot for comparison
barplot(() => {
  summary(() => {
    const routes = generateWideTree(50);

    bench("build: addMany 50 routes (batch)", function* () {
      yield () => {
        createRouteTreeBuilder("", "").addMany(routes).build();
      };
    }).gc("inner");

    bench("build: add 50 routes (incremental)", function* () {
      yield () => {
        const builder = createRouteTreeBuilder("", "");

        for (const route of routes) {
          builder.add(route);
        }

        builder.build();
      };
    }).gc("inner");
  });
});
