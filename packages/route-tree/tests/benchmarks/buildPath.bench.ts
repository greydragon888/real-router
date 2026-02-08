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

import { createRouteTree } from "route-tree";

import {
  generateDeepRouteName,
  generateDeepTreeWithParams,
  generateParams,
  generateRouteWithUrlParams,
} from "./helpers/generators";
import { createMatcher } from "../../src/createMatcher";

import type { Matcher } from "../../src/createMatcher";

interface BenchState {
  get: (name: string) => unknown;
}

function createRegisteredMatcher(tree: any): Matcher {
  const matcher = createMatcher();

  matcher.registerTree(tree);

  return matcher;
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
    const matcher = createRegisteredMatcher(tree);

    bench("buildPath: simple (no params)", () => {
      matcher.buildPath("users");
    });

    bench("buildPath: with 1 URL param", () => {
      matcher.buildPath("user", { id: "123" });
    });

    bench("buildPath: deep (3 levels)", () => {
      matcher.buildPath("user.profile", { id: "123" });
    });
  });
});

// 2.2 buildPath with query params - barplot for comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "search", path: "/search?q&page&sort&filter" }];
    const tree = createRouteTree("", "", routes);
    const matcher = createRegisteredMatcher(tree);

    bench("buildPath: 1 query param", () => {
      matcher.buildPath("search", { q: "test" });
    });

    bench("buildPath: 4 query params", () => {
      matcher.buildPath("search", {
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
      const matcher = createRegisteredMatcher(tree);

      yield () => {
        matcher.buildPath("route", params);
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
      const matcher = createRegisteredMatcher(tree);

      yield () => {
        matcher.buildPath(name, params);
      };
    }).args("levels", [3, 5, 10]);
  });
});

// 2.5 buildPath query params modes - barplot for mode comparison
barplot(() => {
  summary(() => {
    const routes = [{ name: "search", path: "/search?q" }];
    const tree = createRouteTree("", "", routes);
    const matcher = createRegisteredMatcher(tree);

    bench("buildPath: queryParamsMode default", () => {
      matcher.buildPath(
        "search",
        { q: "test" },
        { queryParamsMode: "default" },
      );
    });

    bench("buildPath: queryParamsMode strict", () => {
      matcher.buildPath("search", { q: "test" }, { queryParamsMode: "strict" });
    });

    bench("buildPath: queryParamsMode loose (extra params)", () => {
      matcher.buildPath(
        "search",
        { q: "test", extra: "val" },
        { queryParamsMode: "loose" },
      );
    });
  });
});
