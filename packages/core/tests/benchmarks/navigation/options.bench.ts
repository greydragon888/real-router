/**
 * Navigation options benchmarks
 *
 * Tests navigation with various options:
 * - reload, force, replace flags
 * - URL encoding options
 * - Trailing slash modes
 * - Case sensitivity
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { createSimpleRouter, createCustomRouter } from "./helpers";

import type { Route } from "./helpers";

// Value alternation helpers to prevent JIT optimization
const SIMPLE_ROUTES = ["about", "users", "home"] as const;

// ============================================================================
// Navigation flags
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.2.10 Navigation with reload flag
    {
      const router = createSimpleRouter();

      void router.start();
      void router.navigate("about");

      let i = 0;

      bench("navigate: reload flag", () => {
        do_not_optimize(
          void router.navigate(
            SIMPLE_ROUTES[i++ % SIMPLE_ROUTES.length],
            {},
            { reload: true },
          ),
        );
      }).gc("inner");
    }

    // 1.2.11 Navigation with force flag
    {
      const router = createSimpleRouter();

      void router.start();
      void router.navigate("about");

      let i = 0;

      bench("navigate: force flag", () => {
        do_not_optimize(
          void router.navigate(
            SIMPLE_ROUTES[i++ % SIMPLE_ROUTES.length],
            {},
            { force: true },
          ),
        );
      }).gc("inner");
    }

    // 1.2.16 Navigation with replace flag
    {
      const router = createSimpleRouter();

      void router.start();
      void router.navigate("about");

      let i = 0;

      bench("navigate: replace flag", () => {
        do_not_optimize(
          void router.navigate(
            SIMPLE_ROUTES[i++ % SIMPLE_ROUTES.length],
            {},
            { replace: true },
          ),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// URL encoding
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.1.8 Navigation with uriComponent encoding
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "item", path: "/item/:name" },
      ];
      const router = createCustomRouter(routes, {
        urlParamsEncoding: "uriComponent",
      });

      void router.start();

      const names = [
        "Hello World & Special/Chars",
        "Test & More/Stuff",
        "Another & String/Here",
      ];
      let i = 0;

      bench("navigate: uriComponent encoding", () => {
        do_not_optimize(
          void router.navigate("item", { name: names[i++ % names.length] }),
        );
      }).gc("inner");
    }

    // 1.2.4 Navigation with special characters
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "item", path: "/item/:name" },
      ];
      const router = createCustomRouter(routes, {
        urlParamsEncoding: "uriComponent",
      });

      void router.start();

      const specialStrings = [
        "Hello/World & Special?Chars=Test#Fragment 🚀 Ω ü",
        "Another/Path & More?Query=Value#Hash 🎉 α β",
        "Third/Route & Extra?Param=Data#Anchor 💡 γ δ",
      ];
      let i = 0;

      bench("navigate: special chars (unicode)", () => {
        do_not_optimize(
          void router.navigate("item", {
            name: specialStrings[i++ % specialStrings.length],
          }),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// Encode/decode params
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.1.9 Navigation with decodeParams
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        {
          name: "user",
          path: "/user/:id",
          decodeParams: (params) => ({
            ...params,
            id: Number.parseInt(params.id as string, 10),
          }),
        },
      ];
      const router = createCustomRouter(routes);

      void router.start();

      const userIds = [123, 456, 789, 101];
      let i = 0;

      bench("navigate: with decodeParams", () => {
        do_not_optimize(
          void router.navigate("user", { id: userIds[i++ % userIds.length] }),
        );
      }).gc("inner");
    }

    // 1.1.10 Navigation with encodeParams
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        {
          name: "profile",
          path: "/profile/:userId",
          encodeParams: (params) => ({
            ...params,
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            userId: `user_${String(params.userId)}`,
          }),
        },
      ];
      const router = createCustomRouter(routes);

      void router.start();

      const userIds = ["123", "456", "789", "101"];
      let i = 0;

      bench("navigate: with encodeParams", () => {
        do_not_optimize(
          void router.navigate("profile", {
            userId: userIds[i++ % userIds.length],
          }),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// Router options
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.2.13 Navigation with trailing slash
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "contact", path: "/contact" },
      ];
      const router = createCustomRouter(routes, { trailingSlash: "always" });

      void router.start();

      const routeNames = ["about", "contact", "home"];
      let i = 0;

      bench("navigate: trailingSlash=always", () => {
        do_not_optimize(router.navigate(routeNames[i++ % routeNames.length]));
      }).gc("inner");
    }

    // 1.2.14 Navigation with caseSensitive=false
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "contact", path: "/contact" },
      ];
      const router = createCustomRouter(routes);

      void router.start();

      const routeNames = ["about", "contact", "home"];
      let i = 0;

      bench("navigate: caseSensitive=false", () => {
        do_not_optimize(router.navigate(routeNames[i++ % routeNames.length]));
      }).gc("inner");
    }

    // 1.2.15 Navigation with allowNotFound
    {
      const router = createSimpleRouter({ allowNotFound: true });

      void router.start();

      const nonexistentRoutes = [
        "nonexistent-route-1",
        "nonexistent-route-2",
        "nonexistent-route-3",
      ];
      let i = 0;

      bench("navigate: allowNotFound (nonexistent)", () => {
        do_not_optimize(
          void router.navigate(
            nonexistentRoutes[i++ % nonexistentRoutes.length],
          ),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// Edge cases
// ============================================================================

boxplot(() => {
  summary(() => {
    // 1.2.3 Navigation with very long parameters
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "item", path: "/item/:data" },
      ];
      const router = createCustomRouter(routes);

      void router.start();

      // Pre-create different long strings to alternate
      const longStrings = [
        "a".repeat(10_000),
        "b".repeat(10_000),
        "c".repeat(10_000),
      ];
      let i = 0;

      bench("navigate: 10K char param", () => {
        do_not_optimize(
          void router.navigate("item", {
            data: longStrings[i++ % longStrings.length],
          }),
        );
      }).gc("inner");
    }

    // 1.2.7 Navigation with mixed param types
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "mixed", path: "/mixed?str&num&bool&arr" },
      ];
      const router = createCustomRouter(routes, { queryParamsMode: "loose" });

      void router.start();

      const paramSets = [
        { str: "text", num: 42, bool: true, arr: ["a", "b", "c"] },
        { str: "other", num: 100, bool: false, arr: ["x", "y", "z"] },
        { str: "third", num: 7, bool: true, arr: ["1", "2", "3"] },
      ];
      let i = 0;

      bench("navigate: mixed param types", () => {
        do_not_optimize(
          void router.navigate("mixed", paramSets[i++ % paramSets.length]),
        );
      }).gc("inner");
    }

    // 1.2.8 Navigation with nested objects in params
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "nested", path: "/nested?data" },
      ];
      const router = createCustomRouter(routes, { queryParamsMode: "loose" });

      void router.start();

      const nestedParams = [
        { data: { level1: { level2: { level3: { value: "deep" } } } } },
        { data: { level1: { level2: { level3: { value: "deeper" } } } } },
        { data: { level1: { level2: { level3: { value: "deepest" } } } } },
      ];
      let i = 0;

      bench("navigate: nested object params", () => {
        do_not_optimize(
          void router.navigate(
            "nested",
            nestedParams[i++ % nestedParams.length],
          ),
        );
      }).gc("inner");
    }
  });
});
