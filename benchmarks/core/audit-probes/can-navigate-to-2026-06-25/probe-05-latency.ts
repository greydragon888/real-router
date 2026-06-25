/**
 * Probe 05: canNavigateTo hot-path latency characterization (§10).
 *
 * <Link> adapters may call canNavigateTo per render. Characterize:
 *   A. 0 guards (baseline)
 *   B. 1 sync activate guard (true)
 *   C. 5 sync guards (deep 5-level tree)
 *   D. UNKNOWN_ROUTE (hasRoute=false fast path — no makeState/transitionPath)
 *
 * canNavigateTo has no startTransition/emit/completeTransition, so it should be
 * cheaper than navigate (~4.6µs sync-guard baseline, navigate-2026-05-21).
 * Fresh router per variant (IC megamorphism, benchmarks/CLAUDE.md §2).
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

interface Stats {
  avg: number;
  p50: number;
  rme: number;
}

async function bench(label: string, setup: () => Promise<() => void>): Promise<void> {
  const fn = await setup();
  for (let i = 0; i < 500; i++) fn(); // V8 JIT warmup — do not remove

  const stats = (await measure(
    function* () {
      yield {
        bench() {
          do_not_optimize(fn());
        },
      };
    },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  )) as unknown as { avg: number; p50: number; samples: number[] };

  const n = stats.samples.length;
  const variance = stats.samples.reduce((s, x) => s + (x - stats.avg) ** 2, 0) / n;
  const rme = ((1.96 * Math.sqrt(variance / n)) / stats.avg) * 100;
  const out: Stats = { avg: stats.avg, p50: stats.p50, rme };
  console.log(
    `${label.padEnd(34)} avg=${out.avg.toFixed(1)}ns p50=${out.p50.toFixed(1)}ns rme=${out.rme.toFixed(2)}%${out.rme > 5 ? " [NOISE]" : ""}`,
  );
}

function deepRoutes(): Route[] {
  // a / a.b / a.b.c / a.b.c.d / a.b.c.d.e
  return [
    {
      name: "a",
      path: "/a",
      children: [
        {
          name: "b",
          path: "/b",
          children: [
            {
              name: "c",
              path: "/c",
              children: [
                {
                  name: "d",
                  path: "/d",
                  children: [{ name: "e", path: "/e" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

async function main(): Promise<void> {
  // A — 0 guards
  await bench("A 0-guards (home→target)", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "target", path: "/target" },
    ]);
    await r.start("/");
    return () => r.canNavigateTo("target");
  });

  // B — 1 sync activate guard
  await bench("B 1-sync-guard (true)", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "target", path: "/target" },
    ]);
    await r.start("/");
    getLifecycleApi(r).addActivateGuard("target", () => () => true);
    return () => r.canNavigateTo("target");
  });

  // C — 5 sync guards on a deep tree (a.b.c.d.e), navigating from a.b.c.d.e? no —
  // from "a" so all 5 activate guards on the chain run.
  await bench("C 5-sync-guards (deep a.b.c.d.e)", async () => {
    const r = createRouter(deepRoutes());
    await r.start("/a");
    const lc = getLifecycleApi(r);
    for (const seg of ["a", "a.b", "a.b.c", "a.b.c.d", "a.b.c.d.e"]) {
      lc.addActivateGuard(seg, () => () => true);
    }
    return () => r.canNavigateTo("a.b.c.d.e");
  });

  // D — UNKNOWN_ROUTE (hasRoute=false → earliest return)
  await bench("D unknown-route (hasRoute=false)", async () => {
    const r = createRouter([{ name: "home", path: "/" }]);
    await r.start("/");
    return () => r.canNavigateTo("does-not-exist");
  });
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});
