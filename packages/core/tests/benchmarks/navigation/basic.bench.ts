/**
 * Basic navigation benchmarks
 *
 * Tests core navigation performance:
 * - Simple navigation between routes
 * - Navigation with parameters
 * - Navigation with query parameters
 * - Nested routes navigation
 * - Default route navigation
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import {
  createSimpleRouter,
  createNestedRouter,
  createCustomRouter,
} from "./helpers";

import type { Route } from "./helpers";

// Value alternation helpers to prevent JIT optimization
const SIMPLE_ROUTES = ["about", "users", "home"] as const;
const USER_IDS = ["123", "456", "789", "101"] as const;

// ============================================================================
// Simple navigation
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.1.1 Simple navigation between routes
    {
      const router = createSimpleRouter();

      void router.start();

      let i = 0;

      bench("navigate: simple route", () => {
        do_not_optimize(
          void router.navigate(SIMPLE_ROUTES[i++ % SIMPLE_ROUTES.length]),
        );
      }).gc("inner");
    }

    // 1.1.2 Navigation with route parameters
    {
      const router = createSimpleRouter();

      void router.start();

      let i = 0;

      bench("navigate: with params", () => {
        do_not_optimize(
          void router.navigate("user", { id: USER_IDS[i++ % USER_IDS.length] }),
        );
      }).gc("inner");
    }

    // 1.1.6 Navigation to default route
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "dashboard", path: "/dashboard" },
      ];
      const router = createCustomRouter(routes, {
        defaultRoute: "dashboard",
        defaultParams: { tab: "overview" },
      });

      void router.start();

      bench("navigate: to default route", () => {
        do_not_optimize(router.navigateToDefault());
      }).gc("inner");
    }
  });
});

// ============================================================================
// Navigation with parameters
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.1.4 Navigation with query parameters
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "search", path: "/search?q&category&page" },
      ];
      const router = createCustomRouter(routes, { queryParamsMode: "loose" });

      void router.start();

      const queries = ["test", "search", "find", "lookup"];
      const categories = ["books", "movies", "music"];
      let i = 0;

      bench("navigate: with query params", () => {
        do_not_optimize(
          void router.navigate("search", {
            q: queries[i % queries.length],
            category: categories[i % categories.length],
            page: String(i++ % 10),
          }),
        );
      }).gc("inner");
    }

    // 1.1.5 Navigation with multiple parameters
    {
      const routes: Route[] = [
        {
          name: "complex",
          path: "/complex/:id/:slug/:category?page&sort&limit&offset",
        },
      ];
      const router = createCustomRouter(routes, { queryParamsMode: "loose" });

      void router.start();

      const slugs = ["test-item", "another-item", "third-item"];
      const categories = ["tech", "science", "art"];
      const sorts = ["desc", "asc"];
      let i = 0;

      bench("navigate: with multiple params", () => {
        do_not_optimize(
          void router.navigate("complex", {
            id: String(100 + (i % 50)),
            slug: slugs[i % slugs.length],
            category: categories[i % categories.length],
            page: String(i % 10),
            sort: sorts[i++ % sorts.length],
            limit: "20",
            offset: "0",
          }),
        );
      }).gc("inner");
    }

    // 1.2.5 Navigation with maximum parameters
    {
      const paramNames: string[] = [];

      for (let i = 0; i < 100; i++) {
        paramNames.push(`p${i}`);
      }

      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "many", path: `/many?${paramNames.join("&")}` },
      ];
      const router = createCustomRouter(routes, { queryParamsMode: "loose" });

      void router.start();

      // Pre-create multiple param sets to alternate
      const paramSets: Record<string, string>[] = [];

      for (let set = 0; set < 4; set++) {
        const navParams: Record<string, string> = {};

        for (let i = 0; i < 100; i++) {
          navParams[`p${i}`] = `value${i}_${set}`;
        }

        paramSets.push(navParams);
      }

      let i = 0;

      bench("navigate: 100 query params", () => {
        do_not_optimize(
          void router.navigate("many", paramSets[i++ % paramSets.length]),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// Nested routes navigation
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.1.3 Navigation through nested routes
    {
      const router = createNestedRouter(5);

      void router.start();

      // Alternate between different depth levels
      const nestedRoutes = [
        "root.level1.level2.level3.level4.level5",
        "root.level1.level2.level3.level4",
        "root.level1.level2.level3",
        "root.level1.level2",
      ];
      let i = 0;

      bench("navigate: nested 5 levels", () => {
        do_not_optimize(
          void router.navigate(nestedRoutes[i++ % nestedRoutes.length]),
        );
      }).gc("inner");
    }

    // Deep nesting
    {
      const router = createNestedRouter(10);

      void router.start();

      // Alternate between different depth levels
      const nestedRoutes = [
        "root.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10",
        "root.level1.level2.level3.level4.level5.level6.level7.level8.level9",
        "root.level1.level2.level3.level4.level5.level6.level7.level8",
        "root.level1.level2.level3.level4.level5.level6.level7",
      ];
      let i = 0;

      bench("navigate: nested 10 levels", () => {
        do_not_optimize(
          void router.navigate(nestedRoutes[i++ % nestedRoutes.length]),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// Sequential navigation
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.1.7 Sequential navigation chain
    {
      const router = createSimpleRouter();

      void router.start();

      let i = 0;

      bench("navigate: 5 sequential", () => {
        // Vary the user id to prevent JIT optimization
        const userId = USER_IDS[i++ % USER_IDS.length];

        do_not_optimize(router.navigate("home"));
        do_not_optimize(router.navigate("about"));
        do_not_optimize(router.navigate("users"));
        do_not_optimize(router.navigate("user", { id: userId }));
        do_not_optimize(router.navigate("home"));
      }).gc("inner");
    }

    // 1.2.9 Fast sequential navigations
    {
      const router = createSimpleRouter();

      void router.start();

      let i = 0;

      bench("navigate: 6 fast sequential", () => {
        // Vary the user id to prevent JIT optimization
        const userId = USER_IDS[i++ % USER_IDS.length];

        do_not_optimize(router.navigate("home"));
        do_not_optimize(router.navigate("about"));
        do_not_optimize(router.navigate("users"));
        do_not_optimize(router.navigate("user", { id: userId }));
        do_not_optimize(router.navigate("home"));
        do_not_optimize(router.navigate("about"));
      }).gc("inner");
    }
  });
});
