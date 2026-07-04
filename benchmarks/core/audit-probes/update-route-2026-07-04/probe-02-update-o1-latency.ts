// probe-02: latency — NO_TREE_REBUILD инвариант update() как O(1) от размера дерева.
//
// commitRouteUpdate — field-patch без rebuildTree (routesStore.ts:712-813). Если
// инвариант держится, стоимость update(defaultParams) НЕ зависит от числа маршрутов.
// Сравнение: роутер с 10 маршрутами vs с 1000 (свежий инстанс на вариант — IC).
//
// Запуск НА СЕТИ (AC) — 2026-07-04.
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

const mkRoutes = (n: number): Route[] =>
  Array.from({ length: n }, (_, i) => ({ name: `r${i}`, path: `/r${i}` }));

const bench = async (n: number): Promise<void> => {
  const router = createRouter(mkRoutes(n), { allowNotFound: false });
  const api = getRoutesApi(router);
  let tick = 0;
  const fn = (): void => {
    api.update("r0", { defaultParams: { i: String(tick++ & 1) } });
  };

  for (let i = 0; i < 500; i++) fn(); // V8 JIT warmup

  const stats = await measure(
    function* () {
      yield {
        bench() {
          do_not_optimize(fn());
        },
      };
    },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  );
  const rme = (stats as { rme?: number }).rme ?? 0;

  console.log(
    `update(defaultParams) tree=${n}: avg=${stats.avg.toFixed(1)}ns p50=${stats.p50.toFixed(1)}ns rme=${rme.toFixed(2)}%`,
  );
};

void (async () => {
  await bench(10);
  await bench(1000);
  console.log("probe-02 done (O(1) если avg сопоставимы)");
})();
