/**
 * Isolated measure() tests for navigate() performance.
 *
 * Uses mitata's low-level measure() API for precise, isolated measurements.
 * Run: BENCH_ROUTER=real-router npx tsx src/isolated-navigate.ts
 *       BENCH_ROUTER=router6 npx tsx src/isolated-navigate.ts
 */

import { measure } from "mitata";

import { createRouter, createSimpleRouter, ROUTER_NAME } from "./helpers";

import type { Route } from "./helpers";

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
  opts?: { warmup?: number },
): Promise<MeasureResult> {
  const warmupCount = opts?.warmup ?? 500;

  for (let i = 0; i < warmupCount; i++) {
    fn();
  }

  const stats = await measure(
    function* () {
      yield {
        [0]() {},
        bench() {
          fn();
        },
      };
    },
    {
      batch_samples: 5 * 1024,
      min_cpu_time: 500 * 1e6,
    },
  );

  const avg: number = stats.avg;
  const p50: number = stats.p50;
  const p99: number = stats.p99;
  const rme: number = (stats as unknown as { rme?: number }).rme ?? 0;

  console.log(
    `  ${name.padEnd(55)} avg: ${fmt(avg)}  p50: ${fmt(p50)}  p99: ${fmt(p99)}  rme: ${rme.toFixed(3)}%`,
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
  console.log(`\n=== Isolated Navigate Benchmarks: ${ROUTER_NAME} ===\n`);

  // ── 1. Simple navigation (home ↔ about) ──
  console.log("── 1. Simple navigation (home ↔ about) ──");
  {
    const router = createSimpleRouter();
    const routes = ["home", "about"];
    let index = 0;

    void router.start("/");

    await isolatedMeasure("Simple navigate (alternating)", () => {
      void router.navigate(routes[index++ % 2]);
    });
  }

  // ── 2. Same route repeated (SAME_STATES rejection) ──
  console.log("\n── 2. Same route (SAME_STATES fast path) ──");
  {
    const router = createSimpleRouter();

    void router.start("/");

    await isolatedMeasure("Navigate same route (SAME_STATES)", () => {
      void router.navigate("home");
    });
  }

  // ── 3. Navigation with route parameters ──
  console.log("\n── 3. Navigation with route parameters ──");
  {
    const router = createSimpleRouter();
    const ids = ["123", "456"];
    let index = 0;

    void router.start("/");

    await isolatedMeasure("Navigate with params (alternating)", () => {
      void router.navigate("user", { id: ids[index++ % 2] });
    });
  }

  // ── 4. Nested routes ──
  console.log("\n── 4. Nested routes ──");
  {
    const nestedRoutes: Route[] = [
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id/profile" }],
      },
    ];
    const router = createRouter(nestedRoutes);
    const targets = [
      { name: "home", params: {} },
      { name: "users.profile", params: { id: "123" } },
    ] as const;
    let index = 0;

    void router.start("/");

    await isolatedMeasure("Navigate nested (alternating)", () => {
      const target = targets[index++ % 2];

      void router.navigate(target.name, target.params);
    });
  }

  // ── 5. Navigation with query parameters ──
  console.log("\n── 5. Navigation with query parameters ──");
  {
    const router = createSimpleRouter();
    const searchTerms = [{ search: "foo" }, { search: "bar" }];
    let index = 0;

    void router.start("/");

    await isolatedMeasure("Navigate with query params", () => {
      void router.navigate("about", searchTerms[index++ % 2]);
    });
  }

  // ── 6. Navigation with multiple parameters ──
  console.log("\n── 6. Navigation with multiple parameters ──");
  {
    const multiParamRoutes: Route[] = [
      { name: "home", path: "/" },
      { name: "item", path: "/items/:category/:id/:variant" },
    ];
    const router = createRouter(multiParamRoutes);
    const targets = [
      { name: "home", params: {} },
      {
        name: "item",
        params: { category: "books", id: "42", variant: "hardcover" },
      },
    ] as const;
    let index = 0;

    void router.start("/");

    await isolatedMeasure("Navigate multi-param (alternating)", () => {
      const target = targets[index++ % 2];

      void router.navigate(target.name, target.params);
    });
  }

  // ── 7. Navigation with reload flag ──
  console.log("\n── 7. Navigation with reload flag ──");
  {
    const router = createSimpleRouter();

    void router.start("/");

    await isolatedMeasure("Navigate with reload", () => {
      void router.navigate("home", {}, { reload: true });
    });
  }

  // ── 8. Navigate to default route ──
  console.log("\n── 8. Navigate to default route ──");
  {
    const router = createSimpleRouter();
    const routes = ["home", "about"];
    let index = 0;

    void router.start("/about");

    await isolatedMeasure("Navigate to default (alternating)", () => {
      void router.navigate(routes[index++ % 2]);
    });
  }

  // ── 9. Sequential navigation chain ──
  console.log("\n── 9. Sequential navigation chain (4 steps) ──");
  {
    const router = createSimpleRouter();
    const chain = ["home", "about", "users", "home"];
    let index = 0;

    void router.start("/");

    await isolatedMeasure("Sequential chain (4 routes)", () => {
      void router.navigate(chain[index++ % 4]);
    });
  }

  // ── 10. One-directional navigation (no alternating) ──
  console.log(
    "\n── 10. One-directional: home → about (always same direction) ──",
  );
  {
    const router = createSimpleRouter();
    let toAbout = true;

    void router.start("/");

    await isolatedMeasure("Navigate one direction", () => {
      if (toAbout) {
        void router.navigate("about");
      } else {
        void router.navigate("home");
      }

      toAbout = !toAbout;
    });
  }

  console.log("\nDone.\n");
}

main().catch(console.error);
