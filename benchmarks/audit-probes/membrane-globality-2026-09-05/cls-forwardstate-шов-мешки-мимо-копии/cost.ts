// CANNOT-AFFORD check for the `forwardState` seam's pass-through doors.
//
// Strategy (a) here = ONE shallow copy of each channel container at the seam's
// entrance (exactly what `Router.ts · snapshotForwarded` already does when an
// interceptor is registered). Emulated from OUTSIDE by copying the bags before
// the call — same added work, no src edit.
//
// Shape: the REAL shape of this family's bag — one path key, one query key
// (route `q` = `/q/:id?tab`), not the five-key figure.
//
// Arms, interleaved A B A B A B, medians of the three p50s per arm; the spread
// among the three A runs is the A/A floor.
//   A  door with the caller's own containers
//   B  door with `{ ...params }` / `{ ...search }` made first
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-forwardstate-шов-мешки-мимо-копии/cost.ts
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "q", path: "/q/:id?tab" },
];

const OPTS = { batch_samples: 4 * 1024, min_cpu_time: 300 * 1e6 } as const;

const bench = async (fn: () => unknown): Promise<number> => {
  for (let i = 0; i < 3000; i += 1) {
    fn();
  }

  const stats = await measure(
    function* () {
      yield {
        bench() {
          do_not_optimize(fn());
        },
      };
    },
    OPTS,
  );

  return stats.p50;
};

const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

void (async () => {
  const params: Bag = { id: "7" };
  const search: Bag = { tab: "x" };

  const r = createRouter(ROUTES() as never, {} as never);

  await r.start("/home");

  const api = getPluginApi(r);

  const doors: Record<string, [() => unknown, () => unknown]> = {
    // per-render door (#2087: `buildPath` runs the seam)
    "Router.buildPath(q, params, search)": [
      () => r.buildPath("q", params as never, search as never),
      () => r.buildPath("q", { ...params } as never, { ...search } as never),
    ],
    // the plugin-facing door itself
    "PluginApi.forwardState(q, params, search)": [
      () => api.forwardState("q", params as never, search as never),
      () => api.forwardState("q", { ...params } as never, { ...search } as never),
    ],
    // per-render predicate that reaches `RoutesNamespace.forwardState` directly
    "Router.isActiveRoute(q, params)": [
      () => r.isActiveRoute("q", params as never),
      () => r.isActiveRoute("q", { ...params } as never),
    ],
  };

  const report: Record<string, unknown> = {};

  for (const [label, [armA, armB]] of Object.entries(doors)) {
    const as: number[] = [];
    const bs: number[] = [];

    for (let round = 0; round < 3; round += 1) {
      as.push(await bench(armA));
      bs.push(await bench(armB));
    }

    const a = median(as);
    const b = median(bs);
    const aaFloorPct = ((Math.max(...as) - Math.min(...as)) / a) * 100;

    report[label] = {
      baselineNs: +a.toFixed(2),
      withCopyNs: +b.toFixed(2),
      deltaPct: +(((b - a) / a) * 100).toFixed(2),
      aaFloorPct: +aaFloorPct.toFixed(2),
      aRuns: as.map((x) => +x.toFixed(2)),
      bRuns: bs.map((x) => +x.toFixed(2)),
    };
  }

  // The copy alone, for scale.
  const spread = await bench(() => ({ ...params }));

  report["{ ...params } alone, ns p50"] = +spread.toFixed(2);
  console.log(JSON.stringify(report, null, 1));
  r.dispose();
})();
