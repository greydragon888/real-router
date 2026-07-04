// probe-02: latency — цена listener-gated диффа replace() («Решение 3.B»).
//
// getRoutesApi.ts: before-снапшот (collectFlatRoutes) + diffFlatRoutes считаются
// ТОЛЬКО при treeChanged.listenerCount() > 0. Пробa квантифицирует, что покупает
// этот гейт: replace(100 routes) без listener'а vs с одним listener'ом.
//
// Запуск НА СЕТИ (AC) — 2026-07-04. Свежий router на вариант (IC megamorphism).
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

const N = 100;

const mkRoutes = (): Route[] =>
  Array.from({ length: N }, (_, i) => ({ name: `r${i}`, path: `/r${i}` }));

void (async () => {
  // --- вариант A: 0 listener'ов (гейт закрыт, диффа нет) ---
  {
    const router = createRouter(mkRoutes(), { allowNotFound: false });
    const api = getRoutesApi(router);
    const routes = mkRoutes();
    const fn = (): void => {
      api.replace(routes);
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
      `A replace(${N}) 0-listeners: avg=${stats.avg.toFixed(1)}ns p50=${stats.p50.toFixed(1)}ns rme=${rme.toFixed(2)}%`,
    );
  }

  // --- вариант B: 1 listener (before-снапшот + diff на каждый replace) ---
  {
    const router = createRouter(mkRoutes(), { allowNotFound: false });
    const api = getRoutesApi(router);

    api.subscribeChanges(() => {
      /* пустой consumer — измеряем только сборку payload'а */
    });

    const routes = mkRoutes();
    const fn = (): void => {
      api.replace(routes);
    };

    for (let i = 0; i < 500; i++) fn();

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
      `B replace(${N}) 1-listener : avg=${stats.avg.toFixed(1)}ns p50=${stats.p50.toFixed(1)}ns rme=${rme.toFixed(2)}%`,
    );
  }

  console.log("probe-02 done");
})();
