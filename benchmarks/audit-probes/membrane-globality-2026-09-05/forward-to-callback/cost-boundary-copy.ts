// CANNOT-AFFORD check for ForwardToCallback·params: what does ONE boundary copy
// of the caller's bag cost on the dynamic-forward path, measured rather than
// argued. Three arms on a fresh router each (IC isolation):
//   A  PluginApi.forwardState("a", bag) — bare (handle held, exit copy only)
//   B  same, with ONE pass-through interceptor on the seam — the seam's
//      `snapshotForwarded` spread runs here, plus the chain's own overhead,
//      so B − A is an UPPER bound of strategy (a) at this door
//   C  a bare `{ ...bag }` spread of the same 1-key bag — the copy alone
//   D  the callback alone (the app code core already pays for on this path)
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/forward-to-callback/cost-boundary-copy.ts
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "a", path: "/a/:id", forwardTo: (_g: unknown, p: Bag) => (p.id === "" ? "home" : "b") },
  { name: "b", path: "/b/:id" },
];

const OPTS = { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 } as const;

const report = (label: string, stats: { avg: number; p50: number }): void => {
  const rme = (stats as { rme?: number }).rme ?? 0;

  console.log(
    `${label}: avg=${stats.avg.toFixed(1)}ns p50=${stats.p50.toFixed(1)}ns rme=${rme.toFixed(2)}%`,
  );
};

const bench = async (label: string, fn: () => unknown): Promise<number> => {
  for (let i = 0; i < 2000; i += 1) {
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

  report(label, stats);

  return stats.p50;
};

void (async () => {
  const bag: Bag = { id: "7" };

  // A — bare
  const rA = createRouter(ROUTES() as never, {} as never);
  const apiA = getPluginApi(rA);
  const a = await bench("A forwardState dynamic hop, bare", () =>
    apiA.forwardState("a", bag as never),
  );

  // B — one pass-through interceptor (snapshot + chain)
  const rB = createRouter(ROUTES() as never, {} as never);
  const apiB = getPluginApi(rB);

  apiB.addInterceptor("forwardState", (next, n, p, s) => next(n, p, s));

  const b = await bench("B forwardState dynamic hop, pass-through interceptor", () =>
    apiB.forwardState("a", bag as never),
  );

  // C — the copy alone
  const c = await bench("C { ...bag } spread, 1 key", () => ({ ...bag }));

  // D — the callback alone
  const cb = (_g: unknown, p: Bag): string => (p.id === "" ? "home" : "b");
  const d = await bench("D the forwardTo callback alone", () => cb(undefined, bag));

  console.log(
    JSON.stringify({
      "B − A (upper bound of one boundary copy at this door, ns p50)": +(b - a).toFixed(1),
      "C (the spread alone, ns p50)": +c.toFixed(1),
      "D (the callback alone, ns p50)": +d.toFixed(1),
      "A (bare door, ns p50)": +a.toFixed(1),
      "C ÷ A": +(c / a).toFixed(3),
    }),
  );
})();
