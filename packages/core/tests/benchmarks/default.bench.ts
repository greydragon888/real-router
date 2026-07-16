/**
 * Core hot-path benchmarks — DEFAULT matcher form (no option overrides).
 *
 * Covers (RFC §6.3):
 *   Axis A — synchronous `navigate()` paths (incl. deactivation-guard phase and
 *            `subscribe` success fan-out).
 *   Axis C — view-layer: `buildPath` (warm), `isActiveRoute`, `canNavigateTo`,
 *            `areStatesEqual`, `shouldUpdateNode`, `matchPath`.
 *   Axis B — worst-case route/tree inputs reachable under default options
 *            (splat backtracking, percent-decode, wide tree, deep nesting,
 *            constraints, optional params). HARVESTED from the removed
 *            path-matcher / route-tree leaf benches (§6.5 / §9.1).
 *
 * Different route data under the SAME (default) options is realistic
 * polymorphism, not megamorphism — option-specific forms (strict-query /
 * trailing-preserve / encoding) live in their own files (§9.2). Setup (routers
 * built + started, states captured) happens outside the measured task fns.
 */
import {
  batched,
  deepName,
  deepPath,
  deepRoutes,
  isMain,
  keep,
  makeBench,
  noopSuccessPlugin,
  passthroughGuardFactory,
  settleHeap,
  splatRoutes,
  wideRoutes,
} from "./fixtures";
import { createRouter } from "../../src";
import { getLifecycleApi, getPluginApi } from "../../src/api";

import type { Route } from "../../src";
import type { Bench } from "tinybench";

/**
 * N `router.subscribe` success listeners (1 / 3 / 5) — the real view-layer
 * fan-out: every mounted component subscribes via useSyncExternalStore, so each
 * commit dispatches TRANSITION_SUCCESS to N listeners synchronously. This is the
 * most common production fan-out; `plugins-N` (onTransitionSuccess) is a
 * neighbouring dispatch path, not a substitute for N success subscribers.
 */
async function addSubscribeFanout(bench: Bench): Promise<void> {
  for (const [count, batch] of [
    [1, 192],
    [3, 384],
    [5, 384],
  ] as const) {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "page", path: "/page" },
    ]);

    for (let s = 0; s < count; s++) {
      router.subscribe(() => {});
    }

    await router.start("/");
    const targets = ["page", "home"] as const;
    let i = 0;

    bench.add(
      `navigate/subscribe-${String(count)}`,
      batched(batch, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }
}

/**
 * 3 passthrough deactivate guards firing EVERY iteration (deactivation phase,
 * innermost→outermost, before LEAVE_APPROVE). `sync-guards` only exercises
 * activation; both siblings here carry deactivate guards so leaving either route
 * runs the full chain (AbortController alloc+release included).
 */
async function addDeactivateGuards(bench: Bench): Promise<void> {
  const router = createRouter([
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);

  for (const name of ["a", "b"] as const) {
    for (let g = 0; g < 3; g++) {
      getLifecycleApi(router).addDeactivateGuard(name, passthroughGuardFactory);
    }
  }

  await router.start("/a");
  const targets = ["b", "a"] as const;
  let i = 0;

  bench.add(
    "navigate/sync-deactivate-guards",
    batched(256, () => {
      void router.navigate(targets[i++ % targets.length]);
    }),
  );
}

/**
 * `canNavigateTo` — synchronous per-Link disabled-state (Navigator subset).
 * Guardless target hits the no-guard fast path (the common Link); the navbar
 * batch is the real fan-out (one check per rendered Link, one entry being the
 * current route → same-state short-circuit); the guarded target exercises
 * synchronous activation-guard evaluation (an async guard would resolve false).
 */
async function addCanNavigateTo(bench: Bench): Promise<void> {
  const nav = createRouter([
    { name: "home", path: "/" },
    { name: "dashboard", path: "/dashboard" },
    { name: "profile", path: "/profile" },
    { name: "settings", path: "/settings" },
    { name: "help", path: "/help" },
    { name: "admin", path: "/admin" },
  ]);

  for (let g = 0; g < 3; g++) {
    getLifecycleApi(nav).addActivateGuard("admin", passthroughGuardFactory);
  }

  await nav.start("/");
  const navbar = ["home", "dashboard", "profile", "settings", "help"];

  bench.add(
    "state/canNavigateTo-allowed",
    batched(1024, () => {
      keep(nav.canNavigateTo("dashboard"));
    }),
  );
  bench.add(
    "state/canNavigateTo-navbar-5",
    batched(192, () => {
      for (const name of navbar) {
        keep(nav.canNavigateTo(name));
      }
    }),
  );
  bench.add(
    "state/canNavigateTo-guarded",
    batched(1024, () => {
      keep(nav.canNavigateTo("admin"));
    }),
  );
}

export async function run(): Promise<void> {
  const bench = makeBench("default");

  // ========================================================================
  // Axis A — navigate() synchronous paths
  // ========================================================================

  // sync-baseline: flat, no guards, no leave listeners — purest sync path.
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "users", path: "/users" },
    ]);

    await router.start("/");
    const targets = ["about", "users", "home"] as const;
    let i = 0;

    bench.add(
      "navigate/sync-baseline",
      batched(64, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }

  // same-state fast-reject: navigate to the current route (cached rejection).
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    await router.start("/about");

    bench.add(
      "navigate/same-state-reject",
      batched(512, () => {
        void router.navigate("about");
      }),
    );
  }

  // sync-guards: 3 passthrough activate guards (AbortController alloc+release, #722).
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "page", path: "/page" },
    ]);

    for (let g = 0; g < 3; g++) {
      getLifecycleApi(router).addActivateGuard("page", passthroughGuardFactory);
    }

    await router.start("/");
    const targets = ["page", "home"] as const;
    let i = 0;

    bench.add(
      "navigate/sync-guards",
      batched(96, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }

  // sync-deactivate-guards: deactivation-phase guards every iteration — helper.
  await addDeactivateGuards(bench);

  // deep transition: long activate/deactivate chain (nested 5 / 10).
  for (const depth of [5, 10]) {
    const router = createRouter(deepRoutes(depth));

    await router.start("/l0");
    const targets = [deepName(depth), "l0"] as const;
    let i = 0;

    bench.add(
      `navigate/deep-${String(depth)}`,
      batched(256, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }

  // forwardTo redirect (members → users).
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "members", path: "/members", forwardTo: "users" },
    ]);

    await router.start("/");
    const targets = ["members", "home"] as const;
    let i = 0;

    bench.add(
      "navigate/forwardTo",
      batched(384, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }

  // N-plugin onTransitionSuccess fan-out (1 / 3 / 5).
  for (const [count, batch] of [
    [1, 192],
    [3, 384],
    [5, 384],
  ] as const) {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "page", path: "/page" },
    ]);

    for (let p = 0; p < count; p++) {
      router.usePlugin(noopSuccessPlugin);
    }

    await router.start("/");
    const targets = ["page", "home"] as const;
    let i = 0;

    bench.add(
      `navigate/plugins-${String(count)}`,
      batched(batch, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }

  // N router.subscribe success listeners (1 / 3 / 5) — see helper docstring.
  await addSubscribeFanout(bench);

  // N sync subscribeLeave listeners (1 / 3) — AbortController + frozen LeaveState.
  for (const count of [1, 3]) {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "users", path: "/users" },
    ]);

    for (let l = 0; l < count; l++) {
      router.subscribeLeave(() => {});
    }

    await router.start("/");
    const targets = ["about", "users", "home"] as const;
    let i = 0;

    bench.add(
      `navigate/leave-${String(count)}`,
      batched(192, () => {
        void router.navigate(targets[i++ % targets.length]);
      }),
    );
  }

  // ========================================================================
  // Axis C — view layer
  // ========================================================================

  const view = createRouter([
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        {
          name: "view",
          path: "/view/:id",
          children: [{ name: "settings", path: "/settings" }],
        },
      ],
    },
    {
      name: "withDefaults",
      path: "/wd/:id?tab",
      defaultParams: { tab: "overview" },
    },
    {
      name: "encoded",
      path: "/enc/:id",
      encodeParams: (params) => ({ ...params, id: `e-${params.id as string}` }),
    },
    { name: "files", path: "/files/*path" },
  ]);

  await view.start("/");
  const fromState = await view.navigate("users.list");
  const toState = await view.navigate("users.view", { id: "123" });

  // buildPath (warm — after start(), options cached).
  bench.add(
    "buildPath/warm-static",
    batched(6144, () => {
      keep(view.buildPath("users.list"));
    }),
  );
  bench.add(
    "buildPath/warm-params",
    batched(2048, () => {
      keep(view.buildPath("users.view", { id: "123" }));
    }),
  );
  bench.add(
    "buildPath/warm-defaultParams",
    batched(256, () => {
      keep(view.buildPath("withDefaults", { id: "5" }));
    }),
  );
  bench.add(
    "buildPath/warm-encoder",
    batched(2048, () => {
      keep(view.buildPath("encoded", { id: "x" }));
    }),
  );
  bench.add(
    "buildPath/warm-splat",
    batched(768, () => {
      keep(view.buildPath("files", { path: "a/b/c" }));
    }),
  );

  // isActiveRoute — active state is users.view {id:123}.
  bench.add(
    "state/isActiveRoute-exact",
    batched(4096, () => {
      keep(view.isActiveRoute("users.view", { id: "123" }));
    }),
  );
  bench.add(
    "state/isActiveRoute-parent",
    batched(8192, () => {
      keep(view.isActiveRoute("users"));
    }),
  );
  bench.add(
    "state/isActiveRoute-sibling",
    batched(16_384, () => {
      keep(view.isActiveRoute("users.list"));
    }),
  );
  bench.add(
    "state/isActiveRoute-strict",
    batched(6144, () => {
      keep(view.isActiveRoute("users.view", { id: "123" }, true));
    }),
  );
  {
    const navbar = [
      "home",
      "users",
      "users.list",
      "users.view",
      "withDefaults",
    ];

    bench.add(
      "state/isActiveRoute-navbar-5",
      batched(1024, () => {
        for (const name of navbar) {
          keep(view.isActiveRoute(name));
        }
      }),
    );
  }

  // canNavigateTo — synchronous per-Link disabled-state (Navigator) — helper.
  await addCanNavigateTo(bench);

  // shouldUpdateNode — N-node batch (legitimate getTransitionPath ref-cache, §6.6.2).
  {
    const names = ["home", "users", "users.list", "users.view", "withDefaults"];
    const predicates = names.map((name) => view.shouldUpdateNode(name));

    bench.add(
      "state/shouldUpdateNode-batch",
      batched(2048, () => {
        for (const predicate of predicates) {
          keep(predicate(toState, fromState));
        }
      }),
    );
  }

  // areStatesEqual — two states differing only in a query param.
  {
    const eq = createRouter([
      { name: "home", path: "/" },
      { name: "search", path: "/search?q&page" },
    ]);

    await eq.start("/");
    const sA = await eq.navigate("search", { q: "a", page: "1" });
    const sB = await eq.navigate("search", { q: "a", page: "2" });

    bench.add(
      "state/areStatesEqual-ignoreQuery",
      batched(65_536, () => {
        keep(eq.areStatesEqual(sA, sB));
      }),
    );
    bench.add(
      "state/areStatesEqual-fullCompare",
      batched(8192, () => {
        keep(eq.areStatesEqual(sA, sB, false));
      }),
    );
  }

  // ========================================================================
  // Axis B — matchPath worst-case inputs (default options)
  // ========================================================================

  const matchCases: {
    batch: number;
    name: string;
    routes: Route[];
    start: string;
    url: string;
  }[] = [
    {
      batch: 768,
      name: "matchPath/flat",
      routes: [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "users", path: "/users" },
      ],
      start: "/",
      url: "/users",
    },
    {
      batch: 384,
      name: "matchPath/nested-4",
      routes: [
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
                  children: [{ name: "settings", path: "/settings" }],
                },
              ],
            },
          ],
        },
      ],
      start: "/app/users/1/settings",
      url: "/app/users/123/settings",
    },
    {
      batch: 128,
      name: "matchPath/search-params",
      routes: [
        { name: "home", path: "/" },
        { name: "search", path: "/search?q&page&category" },
      ],
      start: "/",
      url: "/search?q=hello&page=1&category=books",
    },
    {
      batch: 768,
      name: "matchPath/forwardTo",
      routes: [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
        { name: "members", path: "/members", forwardTo: "users" },
      ],
      start: "/",
      url: "/members",
    },
    {
      batch: 192,
      name: "matchPath/defaultParams",
      routes: [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users?sort&page",
          defaultParams: { sort: "asc", page: "1" },
        },
      ],
      start: "/",
      url: "/users?sort=desc",
    },
    {
      batch: 384,
      name: "matchPath/splat-backtrack",
      routes: splatRoutes(50),
      start: "/base",
      url: "/base/unknown/deep/path",
    },
    {
      batch: 256,
      name: "matchPath/utf8-decode",
      routes: [{ name: "user", path: "/users/:id" }],
      start: "/users/seed",
      url: "/users/%E4%B8%AD%E6%96%87%E6%B5%8B%E8%AF%95",
    },
    {
      batch: 256,
      name: "matchPath/multi-decode",
      routes: [
        {
          name: "a",
          path: "/a/:p1",
          children: [{ name: "b", path: "/b/:p2" }],
        },
      ],
      start: "/a/seed/b/seed",
      url: "/a/hello%20world/b/foo%26bar",
    },
    {
      batch: 768,
      name: "matchPath/wide-500",
      routes: wideRoutes(500),
      start: "/route0",
      url: "/route250",
    },
    {
      batch: 768,
      name: "matchPath/deep-10",
      routes: deepRoutes(10),
      start: "/l0",
      url: deepPath(10),
    },
    {
      batch: 256,
      name: "matchPath/constraints",
      routes: [
        {
          name: "r",
          path: String.raw`/a/:p1<\d+>/:p2<[a-z]+>/:p3<\d+>/:p4<[a-z]+>/:p5<\d+>`,
        },
      ],
      start: "/a/1/abc/2/def/3",
      url: "/a/1/abc/2/def/3",
    },
    {
      batch: 384,
      name: "matchPath/constraints-uuid",
      routes: [
        {
          name: "entity",
          path: "/entities/:id<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}>",
        },
      ],
      start: "/entities/550e8400-e29b-41d4-a716-446655440000",
      url: "/entities/550e8400-e29b-41d4-a716-446655440000",
    },
    {
      batch: 512,
      name: "matchPath/optional-present",
      routes: [{ name: "profile", path: "/profiles/:id?" }],
      start: "/profiles",
      url: "/profiles/456",
    },
    {
      batch: 512,
      name: "matchPath/optional-absent",
      routes: [{ name: "profile", path: "/profiles/:id?" }],
      start: "/profiles/seed",
      url: "/profiles",
    },
  ];

  for (const matchCase of matchCases) {
    const router = createRouter(matchCase.routes);

    await router.start(matchCase.start);
    const api = getPluginApi(router);

    bench.add(
      matchCase.name,
      batched(matchCase.batch, () => {
        keep(api.matchPath(matchCase.url));
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

if (isMain(__filename)) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
