/**
 * Popstate / browser-navigate round-trip benchmark — baseline for issue #525.
 *
 * The three URL plugins (`browser-plugin`, `hash-plugin`, `navigation-plugin`)
 * handle every browser-initiated navigation as:
 *
 *     const matched = api.matchPath(url);          // step 1: URL → State
 *     router.navigate(matched.name, matched.params, opts);  // step 2: State → URL again
 *
 * `matchPath` already runs `forwardState` (`RoutesNamespace.ts:261`) plus the
 * low-level `matcher.buildPath(...)` (`:278`) plus `matchSourceTrailingSlash`
 * in `trailingSlash:"preserve"` mode. `router.navigate` then re-runs
 * `ctx.forwardState(...)` and `ctx.buildPath(...)` inside `buildNavigateState`
 * (`RouterWiringBuilder.ts:135-156`).
 *
 * The combined hot-path cost has never been measured — existing benches
 * (`matchPath.bench.ts`, `buildPath.bench.ts`) cover the components in
 * isolation. This file fills that gap so a future fix PR can show a delta.
 *
 * Each fixture is exercised twice:
 *   - `matchPath only` — produces a baseline number for `matchPath` cost
 *     under the same fixture-specific options (so the round-trip number can
 *     be subtracted to isolate the `router.navigate` overhead).
 *   - `matchPath + navigate` — full popstate hot-path round-trip.
 *
 * Fixtures: flat / 4-segment nested / search-params / forwardTo /
 * defaultParams / trailingSlash:"preserve".
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { createRouter } from "../../../src";
import { getPluginApi } from "../../../src/api";

import type { Route, Router } from "../../../src";

interface Fixture {
  router: Router;
  urls: readonly string[];
}

function exerciseRoundtrip(fixture: Fixture, i: number): void {
  const url = fixture.urls[i % fixture.urls.length];
  const matched = getPluginApi(fixture.router).matchPath(url);

  if (matched) {
    do_not_optimize(void fixture.router.navigate(matched.name, matched.params));
  }
}

function exerciseRoundtripFast(fixture: Fixture, i: number): void {
  const url = fixture.urls[i % fixture.urls.length];
  const matched = getPluginApi(fixture.router).matchPath(url);

  if (matched) {
    do_not_optimize(void fixture.router.navigateToState(matched));
  }
}

function exerciseMatchOnly(fixture: Fixture, i: number): void {
  const url = fixture.urls[i % fixture.urls.length];

  do_not_optimize(getPluginApi(fixture.router).matchPath(url));
}

// ============================================================================
// Fixture 1 — flat routes, no params
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "users", path: "/users" },
      ];
      const router = createRouter(routes);

      void router.start("/");

      const fixture: Fixture = {
        router,
        urls: ["/", "/about", "/users"] as const,
      };
      let i = 0;

      bench("flat: matchPath only", () => {
        exerciseMatchOnly(fixture, i++);
      }).gc("inner");
    }

    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "users", path: "/users" },
      ];
      const router = createRouter(routes);

      void router.start("/");

      const fixture: Fixture = {
        router,
        urls: ["/", "/about", "/users"] as const,
      };
      let i = 0;

      bench("flat: matchPath + navigate (round-trip)", () => {
        exerciseRoundtrip(fixture, i++);
      }).gc("inner");
    }

    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "users", path: "/users" },
      ];
      const router = createRouter(routes);

      void router.start("/");

      const fixture: Fixture = {
        router,
        urls: ["/", "/about", "/users"] as const,
      };
      let i = 0;

      bench("flat: matchPath + navigateToState (#525 fast path)", () => {
        exerciseRoundtripFast(fixture, i++);
      }).gc("inner");
    }
  });
});

// ============================================================================
// Fixture 2 — 4-segment nested with params
// ============================================================================

boxplot(() => {
  summary(() => {
    const buildNestedRouter = (): Router => {
      const routes: Route[] = [
        {
          name: "app",
          path: "/app",
          children: [
            {
              name: "users",
              path: "/users",
              children: [
                {
                  name: "view",
                  path: "/:id",
                  children: [
                    { name: "settings", path: "/settings" },
                    { name: "posts", path: "/posts/:postId" },
                  ],
                },
              ],
            },
          ],
        },
      ];

      return createRouter(routes);
    };
    const urls = [
      "/app/users/123/settings",
      "/app/users/456/posts/789",
      "/app/users/101",
    ] as const;

    {
      const router = buildNestedRouter();

      void router.start("/app/users/1/settings");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("nested-4: matchPath only", () => {
        exerciseMatchOnly(fixture, i++);
      }).gc("inner");
    }

    {
      const router = buildNestedRouter();

      void router.start("/app/users/1/settings");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("nested-4: matchPath + navigate (round-trip)", () => {
        exerciseRoundtrip(fixture, i++);
      }).gc("inner");
    }

    {
      const router = buildNestedRouter();

      void router.start("/app/users/1/settings");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("nested-4: matchPath + navigateToState (#525 fast path)", () => {
        exerciseRoundtripFast(fixture, i++);
      }).gc("inner");
    }
  });
});

// ============================================================================
// Fixture 3 — search params
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "home", path: "/" },
      { name: "search", path: "/search?q&page&category" },
    ];
    const urls = [
      "/search?q=hello&page=1&category=books",
      "/search?q=router&page=2&category=tech",
      "/search?q=async&page=3&category=async",
    ] as const;

    {
      const router = createRouter(routes, { queryParamsMode: "loose" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("search-params: matchPath only", () => {
        exerciseMatchOnly(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes, { queryParamsMode: "loose" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("search-params: matchPath + navigate (round-trip)", () => {
        exerciseRoundtrip(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes, { queryParamsMode: "loose" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench(
        "search-params: matchPath + navigateToState (#525 fast path)",
        () => {
          exerciseRoundtripFast(fixture, i++);
        },
      ).gc("inner");
    }
  });
});

// ============================================================================
// Fixture 4 — forwardTo (static)
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "members", path: "/members", forwardTo: "users" },
      { name: "people", path: "/people", forwardTo: "users" },
    ];
    const urls = ["/members", "/people", "/users"] as const;

    {
      const router = createRouter(routes);

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("forwardTo: matchPath only", () => {
        exerciseMatchOnly(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes);

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("forwardTo: matchPath + navigate (round-trip)", () => {
        exerciseRoundtrip(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes);

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("forwardTo: matchPath + navigateToState (#525 fast path)", () => {
        exerciseRoundtripFast(fixture, i++);
      }).gc("inner");
    }
  });
});

// ============================================================================
// Fixture 5 — defaultParams
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users?sort&page",
        defaultParams: { sort: "asc", page: "1" },
      },
    ];
    const urls = [
      "/users",
      "/users?sort=desc",
      "/users?sort=asc&page=3",
    ] as const;

    {
      const router = createRouter(routes, { queryParamsMode: "loose" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("defaultParams: matchPath only", () => {
        exerciseMatchOnly(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes, { queryParamsMode: "loose" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("defaultParams: matchPath + navigate (round-trip)", () => {
        exerciseRoundtrip(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes, { queryParamsMode: "loose" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench(
        "defaultParams: matchPath + navigateToState (#525 fast path)",
        () => {
          exerciseRoundtripFast(fixture, i++);
        },
      ).gc("inner");
    }
  });
});

// ============================================================================
// Fixture 6 — trailingSlash: "preserve"
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "about", path: "/about" },
    ];
    const urls = ["/users/", "/users", "/about/", "/about"] as const;

    {
      const router = createRouter(routes, { trailingSlash: "preserve" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("trailingSlash-preserve: matchPath only", () => {
        exerciseMatchOnly(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes, { trailingSlash: "preserve" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench("trailingSlash-preserve: matchPath + navigate (round-trip)", () => {
        exerciseRoundtrip(fixture, i++);
      }).gc("inner");
    }

    {
      const router = createRouter(routes, { trailingSlash: "preserve" });

      void router.start("/");

      const fixture: Fixture = { router, urls };
      let i = 0;

      bench(
        "trailingSlash-preserve: matchPath + navigateToState (#525 fast path)",
        () => {
          exerciseRoundtripFast(fixture, i++);
        },
      ).gc("inner");
    }
  });
});
