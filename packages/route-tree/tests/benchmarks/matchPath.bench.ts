/**
 * matchSegments benchmarks (CRITICAL - HOT PATH)
 *
 * Tests URL matching performance across different scenarios:
 * - Shallow vs deep matching
 * - URL parameters (parameterized)
 * - Query parameters modes
 * - Trailing slash modes
 * - Wide tree scaling (parameterized)
 * - Absolute paths
 */

import { barplot, bench, boxplot, lineplot, summary } from "mitata";

import {
  generateAbsoluteRoutes,
  generateDeepPath,
  generateDeepPathWithParams,
  generateDeepTree,
  generateDeepTreeWithParams,
  generateRouteWithQueryParams,
  generateWideTree,
} from "./helpers/generators";
import { createRouteTree } from "../../modules/builder";
import { matchSegments } from "../../modules/operations/match";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// 1.1 Basic matching scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const routes = generateWideTree(50);
    const tree = createRouteTree("", "", routes);

    bench("matchSegments: shallow first route", () => {
      matchSegments(tree, "/route-0");
    });

    bench("matchSegments: shallow last route", () => {
      matchSegments(tree, "/route-49");
    });

    bench("matchSegments: no match (worst case)", () => {
      matchSegments(tree, "/nonexistent");
    });
  });
});

// 1.2 Deep path matching - lineplot shows scaling trend
lineplot(() => {
  summary(() => {
    bench("matchSegments: deep $levels levels", function* (state: BenchState) {
      const levels = state.get("levels") as number;
      const routes = generateDeepTree(levels);
      const tree = createRouteTree("", "", routes);
      const path = generateDeepPath(levels);

      yield () => {
        matchSegments(tree, path);
      };
    }).args("levels", [5, 10, 20]);
  });
});

// 1.3 Matching with URL parameters - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("matchSegments: $count URL params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const routes = generateDeepTreeWithParams(count);
      const tree = createRouteTree("", "", routes);
      const path = generateDeepPathWithParams(count);

      yield () => {
        matchSegments(tree, path);
      };
    }).args("count", [3, 5, 10]);
  });
});

// 1.4 Query parameters modes - barplot for mode comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "users", path: "/users?page&sort" }];
    const tree = createRouteTree("", "", routes);

    bench("matchSegments: query default mode", () => {
      matchSegments(tree, "/users?page=1&sort=name", {
        queryParamsMode: "default",
      });
    });

    bench("matchSegments: query strict mode", () => {
      matchSegments(tree, "/users?page=1&sort=name", {
        queryParamsMode: "strict",
      });
    });

    bench("matchSegments: query loose mode", () => {
      matchSegments(tree, "/users?page=1&sort=name&extra=val", {
        queryParamsMode: "loose",
      });
    });
  });
});

// 1.5 Many query parameters - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("matchSegments: $count query params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const route = generateRouteWithQueryParams(count);
      const tree = createRouteTree("", "", [route]);
      const query = Array.from({ length: count }, (_, i) => `q${i}=v${i}`).join(
        "&",
      );

      yield () => {
        matchSegments(tree, `/route?${query}`);
      };
    }).args("count", [5, 10, 20]);
  });
});

// 1.6 Trailing slash modes - barplot for mode comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "users", path: "/users" }];
    const tree = createRouteTree("", "", routes);

    bench("matchSegments: trailing slash default", () => {
      matchSegments(tree, "/users/", { trailingSlashMode: "default" });
    });

    bench("matchSegments: trailing slash never", () => {
      matchSegments(tree, "/users/", { trailingSlashMode: "never" });
    });

    bench("matchSegments: trailing slash always", () => {
      matchSegments(tree, "/users", { trailingSlashMode: "always" });
    });

    bench("matchSegments: strictTrailingSlash", () => {
      matchSegments(tree, "/users", { strictTrailingSlash: true });
    });
  });
});

// 1.7 Wide tree scaling - lineplot shows O(n) scaling
lineplot(() => {
  summary(() => {
    bench(
      "matchSegments: wide $width (last route)",
      function* (state: BenchState) {
        const width = state.get("width") as number;
        const routes = generateWideTree(width);
        const tree = createRouteTree("", "", routes);

        yield () => {
          matchSegments(tree, `/route-${width - 1}`);
        };
      },
    ).args("width", [10, 50, 100, 500]);
  });
});

// 1.8 Absolute paths - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const routes = generateAbsoluteRoutes(10);
    const tree = createRouteTree("", "", routes);

    bench("matchSegments: normal path", () => {
      matchSegments(tree, "/normal/nested");
    });

    bench("matchSegments: absolute nested", () => {
      matchSegments(tree, "/absolute");
    });

    bench("matchSegments: absolute modal", () => {
      matchSegments(tree, "/modal-5");
    });
  });
});
