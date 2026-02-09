/**
 * Isolated measure() tests for anomalies detected in comparison.
 *
 * Uses mitata's low-level measure() API for precise, isolated measurements.
 * Run: BENCH_ROUTER=real-router npx tsx src/isolated-anomalies.ts
 *       BENCH_ROUTER=router6 npx tsx src/isolated-anomalies.ts
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter, createSimpleRouter, ROUTER_NAME } from "./helpers";

import type { Route } from "./helpers";

// ─── Setup ───────────────────────────────────────────────────────────────────

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id/profile" }],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MeasureResult {
  avg: number;
  p50: number;
  p99: number;
  rme: number;
}

async function isolatedMeasure(
  name: string,
  fn: () => void,
  opts?: { gc?: boolean; warmup?: number },
): Promise<MeasureResult> {
  // Manual warmup
  const warmupCount = opts?.warmup ?? 500;

  for (let i = 0; i < warmupCount; i++) {
    fn();
  }

  const stats = await measure(
    function* () {
      yield {
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- mitata measure() API requires setup fn at key [0]
        [0]() {},
        bench() {
          fn();
        },
      };
    },
    {
      batch_samples: 5 * 1024,
      min_cpu_time: 500 * 1e6,
      // gc not available in measure() API - use manual gc instead
    },
  );

  const avg: number = stats.avg;
  const p50: number = stats.p50;
  const p99: number = stats.p99;
  // rme is not in mitata's type definitions but exists at runtime
  const rme: number = (stats as unknown as { rme?: number }).rme ?? 0;

  console.log(
    `  ${name.padEnd(60)} avg: ${fmt(avg)}  p50: ${fmt(p50)}  rme: ${rme.toFixed(3)}%`,
  );

  return { avg, p50, p99, rme };
}

function fmt(ns: number): string {
  if (ns >= 1e6) {
    return `${(ns / 1e6).toFixed(2)} ms`;
  }

  if (ns >= 1e3) {
    return `${(ns / 1e3).toFixed(2)} µs`;
  }

  return `${ns.toFixed(2)} ns`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n=== Isolated Anomaly Verification: ${ROUTER_NAME} ===\n`);

  // ── 7.1.1 buildPath simple (×100) ──
  console.log("── 7.1.1 buildPath simple ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.1.1 buildPath simple (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          do_not_optimize(router.buildPath("about"));
        }
      },
      { gc: true },
    );

    // Also single-call to isolate per-call cost
    await isolatedMeasure("7.1.1 buildPath simple (×1)", () => {
      do_not_optimize(router.buildPath("about"));
    });
  }

  // ── 7.1.2 buildPath with params (×100) ──
  console.log("\n── 7.1.2 buildPath with params ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.1.2 buildPath with params (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          do_not_optimize(router.buildPath("user", { id: "123" }));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.1.2 buildPath with params (×1)", () => {
      do_not_optimize(router.buildPath("user", { id: "123" }));
    });
  }

  // ── 7.1.3 buildPath nested (×100) ──
  console.log("\n── 7.1.3 buildPath nested ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.1.3 buildPath nested (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          do_not_optimize(router.buildPath("users.profile", { id: "123" }));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.1.3 buildPath nested (×1)", () => {
      do_not_optimize(router.buildPath("users.profile", { id: "123" }));
    });
  }

  // ── 7.2.1 matchPath simple (×50) ──
  console.log("\n── 7.2.1 matchPath simple ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.2.1 matchPath simple (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/about"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.2.1 matchPath simple (×1)", () => {
      do_not_optimize(router.matchPath("/about"));
    });
  }

  // ── 7.2.4 matchPath nested (×50) ──
  console.log("\n── 7.2.4 matchPath nested ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.2.4 matchPath nested (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/users/123/profile"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.2.4 matchPath nested (×1)", () => {
      do_not_optimize(router.matchPath("/users/123/profile"));
    });
  }

  // ── 7.2.2 matchPath with parameters (×50) ──
  console.log("\n── 7.2.2 matchPath with parameters ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.2.2 matchPath with params (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/users/123"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.2.2 matchPath with params (×1)", () => {
      do_not_optimize(router.matchPath("/users/123"));
    });
  }

  // ── 7.2.3 matchPath with query parameters (×50) ──
  console.log("\n── 7.2.3 matchPath with query parameters ──");
  {
    const router = createRouter(routes);

    await isolatedMeasure(
      "7.2.3 matchPath with query params (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/about?search=test&page=1"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.2.3 matchPath with query params (×1)", () => {
      do_not_optimize(router.matchPath("/about?search=test&page=1"));
    });
  }

  // ── 7.2.5 matchPath with parameter decoding (×50) ──
  console.log("\n── 7.2.5 matchPath with parameter decoding ──");
  {
    const router = createRouter(routes, {
      urlParamsEncoding: "uriComponent",
    });

    await isolatedMeasure(
      "7.2.5 matchPath with param decoding (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/users/test%40example.com"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.2.5 matchPath with param decoding (×1)", () => {
      do_not_optimize(router.matchPath("/users/test%40example.com"));
    });
  }

  // ── 7.2.9 matchPath with trailing slash (×50) ──
  console.log("\n── 7.2.9 matchPath with trailing slash ──");
  {
    const router = createRouter(routes, {
      trailingSlash: "always",
    });

    await isolatedMeasure(
      "7.2.9 matchPath with trailing slash (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/about/"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.2.9 matchPath with trailing slash (×1)", () => {
      do_not_optimize(router.matchPath("/about/"));
    });
  }

  // ── 7.4.8 matchPath with duplicate query params (×50) ──
  console.log("\n── 7.4.8 matchPath with duplicate query params ──");
  {
    const optionalRoutes: Route[] = [
      { name: "home", path: "/" },
      { name: "user", path: "/users/:id" },
      { name: "article", path: "/articles/:id?/:slug?" },
    ];
    const router = createRouter(optionalRoutes);

    await isolatedMeasure(
      "7.4.8 matchPath duplicate query params (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/?tag=1&tag=2&tag=3"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("7.4.8 matchPath duplicate query params (×1)", () => {
      do_not_optimize(router.matchPath("/?tag=1&tag=2&tag=3"));
    });
  }

  // ── 7.4.12 matchPath without optional parameters (×50) ──
  console.log("\n── 7.4.12 matchPath without optional parameters ──");
  {
    const optionalRoutes: Route[] = [
      { name: "home", path: "/" },
      { name: "user", path: "/users/:id" },
      { name: "article", path: "/articles/:id?/:slug?" },
    ];
    const router = createRouter(optionalRoutes);

    await isolatedMeasure(
      "7.4.12 matchPath without optional params (×50)",
      () => {
        for (let i = 0; i < 50; i++) {
          do_not_optimize(router.matchPath("/articles"));
        }
      },
      { gc: true },
    );

    await isolatedMeasure(
      "7.4.12 matchPath without optional params (×1)",
      () => {
        do_not_optimize(router.matchPath("/articles"));
      },
    );
  }

  // ── 8.2.1 areStatesEqual mixed (×100) ──
  console.log("\n── 8.2.1 areStatesEqual mixed ──");
  {
    const router = createSimpleRouter();
    const aboutState = router.makeState("about", {}, "/about");
    const homeState = router.makeState("home", {}, "/");
    const user123State = router.makeState("user", { id: "123" }, "/users/123");
    const user456State = router.makeState("user", { id: "456" }, "/users/456");
    const comparisons = [
      [aboutState, aboutState],
      [aboutState, homeState],
      [user123State, user456State],
      [homeState, aboutState],
    ] as const;

    await isolatedMeasure(
      "8.2.1 areStatesEqual mixed (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          const [s1, s2] = comparisons[i % 4];

          do_not_optimize(router.areStatesEqual(s1, s2));
        }
      },
      { gc: true },
    );
  }

  // ── 8.7.4 areStatesEqual identical params different order (×100) ──
  console.log("\n── 8.7.4 areStatesEqual identical params ──");
  {
    const router = createSimpleRouter();
    const state1 = router.makeState("home", { a: "1", b: "2" }, "/");
    const state2 = router.makeState("home", { b: "2", a: "1" }, "/");

    await isolatedMeasure(
      "8.7.4 areStatesEqual identical params diff order (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          do_not_optimize(router.areStatesEqual(state1, state2));
        }
      },
      { gc: true },
    );
  }

  // ── 8.7.10 areStatesEqual null params (×100) ──
  console.log("\n── 8.7.10 areStatesEqual null params ──");
  {
    const router = createSimpleRouter();
    const state1 = router.makeState("home", { value: null }, "/");
    const state2 = router.makeState("home", { value: undefined }, "/");

    await isolatedMeasure(
      "8.7.10 areStatesEqual null vs undefined (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          do_not_optimize(router.areStatesEqual(state1, state2));
        }
      },
      { gc: true },
    );
  }

  // ── 8.2.2 areStatesEqual with ignoreQueryParams (×100) ──
  console.log("\n── 8.2.2 areStatesEqual with ignoreQueryParams ──");
  {
    const router = createSimpleRouter();
    const state1 = router.makeState(
      "about",
      { search: "test" },
      "/about?search=test",
    );
    const state2 = router.makeState(
      "about",
      { search: "other" },
      "/about?search=other",
    );

    await isolatedMeasure(
      "8.2.2 areStatesEqual ignoreQueryParams (×100)",
      () => {
        for (let i = 0; i < 100; i++) {
          do_not_optimize(router.areStatesEqual(state1, state2, true));
        }
      },
      { gc: true },
    );

    await isolatedMeasure("8.2.2 areStatesEqual ignoreQueryParams (×1)", () => {
      do_not_optimize(router.areStatesEqual(state1, state2, true));
    });
  }

  console.log("\nDone.\n");
}

main().catch(console.error);
