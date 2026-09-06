// CANNOT-AFFORD check for `ForwardToCallback·params` — the round-trip door.
// Strategy (a) here = one shallow copy of the params container before it is
// handed to the dynamic `forwardTo` callback. Emulated from OUTSIDE by copying
// the bag before the call (same added work per traversal, no src edit).
//
// Shape: one path key + one query key, on a route that HAS a dynamic forwardTo
// (so `#resolveDynamicForward` runs — the branch this door lives in).
//
// Arms interleaved A B A B A B; medians of three p50s; spread among the three A
// runs is the A/A floor.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-forwardstate-шов-мешки-мимо-копии/cost-forwardto.ts
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "b", path: "/b/:id?tab" },
  {
    name: "d",
    path: "/d/:id?tab",
    forwardTo: (_g: unknown, p: Bag) => (p.id === "9" ? "home" : "b"),
  },
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
    "PluginApi.forwardState(d, params, search) — dynamic hop": [
      () => api.forwardState("d", params as never, search as never),
      () => api.forwardState("d", { ...params } as never, { ...search } as never),
    ],
    "Router.isActiveRoute(d, params) — dynamic hop, per-render": [
      () => r.isActiveRoute("d", params as never),
      () => r.isActiveRoute("d", { ...params } as never),
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

    report[label] = {
      baselineNs: +a.toFixed(2),
      withCopyNs: +b.toFixed(2),
      deltaPct: +(((b - a) / a) * 100).toFixed(2),
      aaFloorPct: +(((Math.max(...as) - Math.min(...as)) / a) * 100).toFixed(2),
      aRuns: as.map((x) => +x.toFixed(2)),
      bRuns: bs.map((x) => +x.toFixed(2)),
    };
  }

  console.log(JSON.stringify(report, null, 1));
  r.dispose();
})();
