/**
 * buildPath benchmarks
 *
 * Tests URL generation performance:
 * - Simple paths
 * - URL parameters (parameterized)
 * - Query parameters
 * - Deep paths (parameterized)
 * - Query params modes
 */

import { barplot, bench, boxplot, lineplot, summary } from "mitata";

import { buildPath, createRouteTree } from "route-tree";

import {
  generateDeepRouteName,
  generateDeepTreeWithParams,
  generateParams,
  generateRouteWithUrlParams,
} from "./helpers/generators";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// 2.1 Basic buildPath scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    const routes = [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      {
        name: "user",
        path: "/users/:id",
        children: [
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
        ],
      },
    ];
    const tree = createRouteTree("", "", routes);

    bench("buildPath: simple (no params)", () => {
      buildPath(tree, "users");
    });

    bench("buildPath: with 1 URL param", () => {
      buildPath(tree, "user", { id: "123" });
    });

    bench("buildPath: deep (3 levels)", () => {
      buildPath(tree, "user.profile", { id: "123" });
    });
  });
});

// 2.2 buildPath with query params - barplot for comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "search", path: "/search?q&page&sort&filter" }];
    const tree = createRouteTree("", "", routes);

    bench("buildPath: 1 query param", () => {
      buildPath(tree, "search", { q: "test" });
    });

    bench("buildPath: 4 query params", () => {
      buildPath(tree, "search", {
        q: "test",
        page: "1",
        sort: "date",
        filter: "active",
      });
    });
  });
});

// 2.3 buildPath scaling - URL params (lineplot shows scaling)
lineplot(() => {
  summary(() => {
    bench("buildPath: $count URL params", function* (state: BenchState) {
      const count = state.get("count") as number;
      const route = generateRouteWithUrlParams(count);
      const tree = createRouteTree("", "", [route]);
      const params = generateParams(count);

      yield () => {
        buildPath(tree, "route", params);
      };
    }).args("count", [1, 5, 10]);
  });
});

// 2.4 buildPath deep trees - lineplot shows scaling
lineplot(() => {
  summary(() => {
    bench("buildPath: deep $levels levels", function* (state: BenchState) {
      const levels = state.get("levels") as number;
      const routes = generateDeepTreeWithParams(levels);
      const tree = createRouteTree("", "", routes);
      const name = generateDeepRouteName(levels);
      const params = generateParams(levels);

      yield () => {
        buildPath(tree, name, params);
      };
    }).args("levels", [3, 5, 10]);
  });
});

// 2.5 buildPath query params modes - barplot for mode comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "search", path: "/search?q" }];
    const tree = createRouteTree("", "", routes);

    bench("buildPath: queryParamsMode default", () => {
      buildPath(tree, "search", { q: "test" }, { queryParamsMode: "default" });
    });

    bench("buildPath: queryParamsMode strict", () => {
      buildPath(tree, "search", { q: "test" }, { queryParamsMode: "strict" });
    });

    bench("buildPath: queryParamsMode loose (extra params)", () => {
      buildPath(
        tree,
        "search",
        { q: "test", extra: "val" },
        { queryParamsMode: "loose" },
      );
    });
  });
});
