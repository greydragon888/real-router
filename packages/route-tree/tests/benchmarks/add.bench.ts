/**
 * Route Tree Builder benchmarks
 *
 * Tests route tree construction performance:
 * - Single route
 * - Batch addition (parameterized)
 * - Nested routes (parameterized)
 * - Dot-notation
 * - Validation vs skip-validation
 *
 * Note: .gc("inner") is used for tests with heavy allocations to stabilize results
 *
 * API Changes from route-node:
 * - Old: node.add(route) - mutable
 * - New: createRouteTreeBuilder().add(route).build() - immutable
 */

import { barplot, bench, boxplot, lineplot, summary } from "mitata";

import { generateDeepTree, generateWideTree } from "./helpers/generators";
import { createRouteTreeBuilder } from "../../src/builder";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
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

    bench("build: single route (skipValidation)", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .add({ name: "users", path: "/users" })
          .build({ skipValidation: true });
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

// 3.4 Validation vs skip-validation - barplot for comparison
barplot(() => {
  summary(() => {
    const routes = generateWideTree(50);

    bench("build: 50 routes with validation", function* () {
      yield () => {
        createRouteTreeBuilder("", "").addMany(routes).build();
      };
    }).gc("inner");

    bench("build: 50 routes skipValidation", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .addMany(routes)
          .build({ skipValidation: true });
      };
    }).gc("inner");

    bench("build: 50 routes skipSort", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .addMany(routes)
          .build({ skipSort: true });
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
          .build({ skipValidation: true, skipSort: true, skipFreeze: true });
      };
    }).gc("inner");
  });
});

// 3.5 Dot-notation addition - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("build: dot-notation simple (users.profile)", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .add({ name: "users.profile", path: "/users/profile" })
          .build();
      };
    }).gc("inner");

    bench("build: dot-notation deep (a.b.c.d.e)", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .add({ name: "a.b.c.d.e", path: "/a/b/c/d/e" })
          .build();
      };
    }).gc("inner");

    bench("build: dot-notation with existing parent", function* () {
      yield () => {
        createRouteTreeBuilder("", "")
          .add({ name: "users", path: "/users" })
          .add({ name: "users.profile", path: "/profile" })
          .build();
      };
    }).gc("inner");
  });
});

// 3.6 Incremental add vs addMany - barplot for comparison
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
