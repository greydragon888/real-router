/**
 * getTransitionPath cache benchmark
 *
 * Measures the performance difference between single-entry cache (baseline)
 * and LRU KeyIndexCache (post-implementation) for getTransitionPath.
 *
 * Key scenarios:
 * 1. Single-pair repeated calls (shouldUpdateNode pattern) — both should be fast
 * 2. Multi-route cycling (3-5 routes) — single-entry misses, LRU should hit
 * 3. Dashboard tabs pattern (alternating between N tabs)
 * 4. Memory: heap growth under sustained load
 * 5. Parameterized navigation (cache bypass — should be identical)
 *
 * Run: NODE_OPTIONS='--expose-gc' npx tsx tests/benchmarks/transitionPath/getTransitionPath-cache.bench.ts
 */

import { bench, boxplot, run, summary } from "mitata";

import { getTransitionPath } from "../../../src/transitionPath";

import type { State } from "@real-router/types";

// ============================================================================
// Test data factory
// ============================================================================

function makeState(
  name: string,
  params: Record<string, any> = {},
  metaParams: Record<string, any> = {},
): State {
  return {
    name,
    params,
    path: `/${name.replaceAll(".", "/")}`,
    meta: {
      id: 1,
      params: metaParams,
    },
  };
}

// ============================================================================
// Pre-generated test data
// ============================================================================

// --- Scenario 1: Single-pair repeated (shouldUpdateNode pattern) ---
// shouldUpdateNode calls getTransitionPath N times per navigation with same states
const singlePair = {
  from: makeState("users.list"),
  to: makeState("users.profile"),
};

// --- Scenario 2: 3-route cycling (A→B, B→C, C→A, repeat) ---
const threeRoutes = {
  a: makeState("home"),
  b: makeState("users.list"),
  c: makeState("settings.general"),
};

// --- Scenario 3: 5-tab dashboard (user switches between tabs) ---
const tabs = {
  t1: makeState("dashboard.overview"),
  t2: makeState("dashboard.analytics"),
  t3: makeState("dashboard.reports"),
  t4: makeState("dashboard.settings"),
  t5: makeState("dashboard.users"),
};

// --- Scenario 4: 10-route SPA (realistic app with many pages) ---
const spaRoutes = Array.from({ length: 10 }, (_, i) =>
  makeState(`app.section${i}.page`),
);

// --- Scenario 5: parameterized navigation (cache bypass) ---
const paramNav = {
  from: makeState(
    "users.profile",
    { id: "1" },
    { "users.profile": { id: "url" } },
  ),
  to: makeState(
    "users.profile",
    { id: "2" },
    { "users.profile": { id: "url" } },
  ),
};

// --- Scenario 6: deep routes (4 levels) ---
const deepRoutes = {
  from: makeState("app.module.section.page"),
  to: makeState("app.module.section.detail"),
};

// ============================================================================
// Category 1: Speed benchmarks — Cache hit patterns
// ============================================================================

boxplot(() => {
  summary(() => {
    // Single-entry cache wins here: same pair repeated
    bench("single-pair repeated ×10 (shouldUpdateNode)", () => {
      for (let i = 0; i < 10; i++) {
        getTransitionPath(singlePair.to, singlePair.from);
      }
    });

    // Single-entry cache MISSES on every call (always different pair)
    // LRU cache should hit after warmup
    bench("3-route cycling ×30 (A→B, B→C, C→A)", () => {
      for (let i = 0; i < 10; i++) {
        getTransitionPath(threeRoutes.b, threeRoutes.a);
        getTransitionPath(threeRoutes.c, threeRoutes.b);
        getTransitionPath(threeRoutes.a, threeRoutes.c);
      }
    });

    // Dashboard tabs: user clicks between 5 tabs
    // 5 unique pairs, single-entry caches only the last one
    bench("5-tab dashboard ×50", () => {
      for (let i = 0; i < 10; i++) {
        getTransitionPath(tabs.t2, tabs.t1);
        getTransitionPath(tabs.t3, tabs.t2);
        getTransitionPath(tabs.t4, tabs.t3);
        getTransitionPath(tabs.t5, tabs.t4);
        getTransitionPath(tabs.t1, tabs.t5);
      }
    });

    // 10-route SPA: cycling through all pages
    bench("10-route SPA cycling ×100", () => {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          const next = (j + 1) % 10;

          getTransitionPath(spaRoutes[next], spaRoutes[j]);
        }
      }
    });
  });
});

// ============================================================================
// Category 2: Parameterized navigation (cache bypass — control group)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Both implementations should bypass cache for parameterized routes
    bench("parameterized: same route, different params", () => {
      getTransitionPath(paramNav.to, paramNav.from);
    });

    // No fromState — always computes (initial load)
    bench("initial load: no fromState", () => {
      getTransitionPath(singlePair.to);
    });

    // Deep route with no params — cacheable
    bench("deep route: 4 levels, no params (cacheable)", () => {
      getTransitionPath(deepRoutes.to, deepRoutes.from);
    });
  });
});

// ============================================================================
// Category 3: shouldUpdateNode simulation
// N components each calling getTransitionPath with same state pair per navigation
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("shouldUpdateNode: 5 components, 1 navigation", () => {
      // 5 route-node subscribers check the same transition
      for (let i = 0; i < 5; i++) {
        getTransitionPath(singlePair.to, singlePair.from);
      }
    });

    bench("shouldUpdateNode: 20 components, 1 navigation", () => {
      for (let i = 0; i < 20; i++) {
        getTransitionPath(singlePair.to, singlePair.from);
      }
    });

    bench("shouldUpdateNode: 5 components, 3 navigations (cycling)", () => {
      // 3 different navigations, each checked by 5 components
      for (let i = 0; i < 5; i++) {
        getTransitionPath(threeRoutes.b, threeRoutes.a);
      }
      for (let i = 0; i < 5; i++) {
        getTransitionPath(threeRoutes.c, threeRoutes.b);
      }
      for (let i = 0; i < 5; i++) {
        getTransitionPath(threeRoutes.a, threeRoutes.c);
      }
    });
  });
});

// ============================================================================
// Category 4: Memory — heap delta under sustained load
// ============================================================================

const gc = globalThis.gc;

async function measureMemory(
  _label: string,
  fn: () => void,
  iterations: number,
): Promise<{ heapDelta: number; rssDelta: number; timeMs: number }> {
  // Warm up
  for (let i = 0; i < 100; i++) {
    fn();
  }

  if (gc) {
    gc();
  }

  await new Promise((resolve) => setTimeout(resolve, 50));

  const before = process.memoryUsage();
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = performance.now();
  const after = process.memoryUsage();

  return {
    heapDelta: after.heapUsed - before.heapUsed,
    rssDelta: after.rss - before.rss,
    timeMs: end - start,
  };
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);

  if (abs < 1024) {
    return `${bytes} B`;
  }
  if (abs < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Memory tests run after mitata benchmarks
const memoryTests = async () => {
  console.log(`\n${"=".repeat(70)}`);
  console.log("  MEMORY BENCHMARKS");
  console.log("=".repeat(70));

  const tests = [
    {
      name: "single-pair repeated ×100K",
      fn: () => getTransitionPath(singlePair.to, singlePair.from),
      iterations: 100_000,
    },
    {
      name: "3-route cycling ×100K",
      fn: () => {
        getTransitionPath(threeRoutes.b, threeRoutes.a);
        getTransitionPath(threeRoutes.c, threeRoutes.b);
        getTransitionPath(threeRoutes.a, threeRoutes.c);
      },
      iterations: 33_334,
    },
    {
      name: "10-route SPA ×100K",
      fn: () => {
        for (let j = 0; j < 10; j++) {
          const next = (j + 1) % 10;

          getTransitionPath(spaRoutes[next], spaRoutes[j]);
        }
      },
      iterations: 10_000,
    },
    {
      name: "5-tab dashboard ×100K",
      fn: () => {
        getTransitionPath(tabs.t2, tabs.t1);
        getTransitionPath(tabs.t3, tabs.t2);
        getTransitionPath(tabs.t4, tabs.t3);
        getTransitionPath(tabs.t5, tabs.t4);
        getTransitionPath(tabs.t1, tabs.t5);
      },
      iterations: 20_000,
    },
    {
      name: "parameterized (bypass) ×100K",
      fn: () => getTransitionPath(paramNav.to, paramNav.from),
      iterations: 100_000,
    },
  ];

  console.log(
    `\n${"Test".padEnd(35)}${"Heap Δ".padStart(12)}${"RSS Δ".padStart(
      12,
    )}${"Time".padStart(12)}${"Ops/s".padStart(14)}`,
  );
  console.log("-".repeat(85));

  for (const test of tests) {
    if (gc) {
      gc();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await measureMemory(test.name, test.fn, test.iterations);
    let multiplier = 1;

    if (test.name.includes("10-route")) {
      multiplier = 10;
    } else if (test.name.includes("3-route")) {
      multiplier = 3;
    } else if (test.name.includes("cycling") || test.name.includes("SPA")) {
      multiplier = 5;
    }

    const totalOps = test.iterations * multiplier;
    const opsPerSec = Math.round(totalOps / (result.timeMs / 1000));

    console.log(
      test.name.padEnd(35) +
        formatBytes(result.heapDelta).padStart(12) +
        formatBytes(result.rssDelta).padStart(12) +
        `${result.timeMs.toFixed(2)}ms`.padStart(12) +
        `${(opsPerSec / 1000).toFixed(0)}K`.padStart(14),
    );
  }

  console.log(`\n${"=".repeat(70)}`);
};

void run().then(() => memoryTests());
