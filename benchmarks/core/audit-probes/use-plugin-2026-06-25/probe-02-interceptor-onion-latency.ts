/**
 * Probe 02 — latency of the buildPath interceptor onion (deferred from probe-01,
 * was [SKIPPED: battery]; run on AC power).
 *
 * Question (audit раздел 10 / risk #6): does an N-deep interceptor chain on the
 * hot-path `buildPath` scale O(N) (acceptable) and NOT O(N²)? `buildPath` runs
 * on every <Link> render in all adapters; `executeInterceptorChain`
 * (internals.ts:159-173) rebuilds the onion on every call, so per-call cost is
 * expected to be linear in chain length. This probe measures it.
 *
 * Run: npx tsx benchmarks/core/audit-probes/use-plugin-2026-06-25/probe-02-interceptor-onion-latency.ts
 */

import { measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "user", path: "/users/:id" },
];

const DEPTHS = [0, 1, 2, 4, 8, 16, 32];

function fmt(ns: number): string {
  if (ns >= 1e3) {
    return `${(ns / 1e3).toFixed(3)} µs`;
  }

  return `${ns.toFixed(1)} ns`;
}

interface DepthResult {
  depth: number;
  avg: number;
  p50: number;
  rme: number;
}

async function measureAtDepth(depth: number): Promise<DepthResult> {
  const router = createRouter(ROUTES);
  const api = getPluginApi(router);

  // N pass-through interceptors — each just forwards to `next`, so the only
  // cost added is the onion machinery itself (closure build + nested call).
  for (let i = 0; i < depth; i++) {
    api.addInterceptor("buildPath", (next, route, params) =>
      (next as (r: string, p: unknown) => string)(route as string, params),
    );
  }

  let k = 0;
  const fn = (): void => {
    // parametric build so buildPath does real encoding work, not a constant
    router.buildPath("user", { id: String(k++ & 1023) });
  };

  for (let i = 0; i < 1000; i++) {
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

  router.dispose();

  return {
    depth,
    avg: stats.avg,
    p50: stats.p50,
    rme: (stats as unknown as { rme?: number }).rme ?? 0,
  };
}

async function main(): Promise<void> {
  console.log(
    "\n=== Probe 02: buildPath interceptor-onion latency (AC power) ===\n",
  );

  const results: DepthResult[] = [];

  for (const depth of DEPTHS) {
    // fresh measure per depth (own router) — isolates IC shape per chain length
    results.push(await measureAtDepth(depth));
  }

  const base = results[0].avg;

  console.log(
    "depth".padEnd(7) +
      "avg".padEnd(13) +
      "p50".padEnd(13) +
      "rme".padEnd(9) +
      "Δ vs 0".padEnd(13) +
      "per-interceptor",
  );

  for (const r of results) {
    const delta = r.avg - base;
    const perInterceptor = r.depth === 0 ? 0 : delta / r.depth;

    console.log(
      String(r.depth).padEnd(7) +
        fmt(r.avg).padEnd(13) +
        fmt(r.p50).padEnd(13) +
        `${r.rme.toFixed(2)}%`.padEnd(9) +
        (r.depth === 0 ? "—" : `+${fmt(delta)}`).padEnd(13) +
        (r.depth === 0 ? "—" : `${fmt(perInterceptor)}/it`),
    );
  }

  // Linearity check: per-interceptor marginal cost should be ~flat across depth.
  // If O(N²), per-interceptor cost would GROW with depth. Compare the largest
  // two depths' marginal cost against the smallest non-zero depth.
  const perIt = results
    .filter((r) => r.depth > 0)
    .map((r) => ({ depth: r.depth, cost: (r.avg - base) / r.depth }));

  const minCost = Math.min(...perIt.map((p) => p.cost));
  const maxCost = Math.max(...perIt.map((p) => p.cost));
  const spread = maxCost / minCost;

  console.log(
    `\nper-interceptor marginal cost: ${fmt(minCost)} … ${fmt(maxCost)} (spread ×${spread.toFixed(2)})`,
  );
  console.log(
    spread < 2
      ? "=> LINEAR O(N): marginal cost ~flat across depth (not quadratic). buildPath onion overhead is acceptable."
      : `=> NON-FLAT marginal cost (×${spread.toFixed(2)}) — inspect for super-linear scaling.`,
  );
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED:", error);
  process.exitCode = 1;
});
