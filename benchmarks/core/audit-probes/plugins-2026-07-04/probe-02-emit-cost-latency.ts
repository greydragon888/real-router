// probe-02: §10 промпта — emit-cost через plugin listeners (закрывает baseline-пробел:
// на прогоне 2026-06-25 эти замеры были [SKIPPED: battery]; сегодня AC).
//
// Варианты (свежий router на вариант — IC megamorphism):
//   A) navigate, 0 плагинов                      — baseline EventBus emit
//   B) navigate, 1 плагин БЕЗ хуков              — цена пустой регистрации
//   C) navigate, 1 плагин со ВСЕМИ 5 хуками      — цена listener-вызовов per emit
//   D) navigate, 10 плагинов × 5 хуков           — production worst-case
//   E) use(p)+unsubscribe() цикл (1 плагин, 5 хуков) — цена регистрации/снятия
//
// disposeAll(10) не бенчится: одноразовый cold-path, единичный замер = шум.
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";

import type { PluginFactory, Router } from "@real-router/core";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

// КАЖДОМУ плагину — СВЕЖИЕ замыкания хуков: EventEmitter строг к дубликатам
// (Duplicate listener for "$start"), общий module-level noop между плагинами
// роняет usePlugin сырым некодированным Error (класс #1188 — bare event-emitter
// Error с внутренним именем события наружу; probe-инцидент 2026-07-04).
const fullHooksFactory = (): PluginFactory =>
  (() => ({
    onStart: (): void => {},
    onStop: (): void => {},
    onTransitionStart: (): void => {},
    onTransitionSuccess: (): void => {},
    onTransitionError: (): void => {},
    onTransitionCancel: (): void => {},
    onTransitionLeaveApprove: (): void => {},
  })) as PluginFactory;

const benchNavigate = async (label: string, plugins: PluginFactory[]): Promise<number> => {
  const router: Router = createRouter(ROUTES, { allowNotFound: false });

  for (const p of plugins) {
    router.usePlugin(p);
  }

  await router.start("/a");

  let flip = false;
  const fn = (): Promise<unknown> => {
    flip = !flip;

    return router.navigate(flip ? "b" : "a");
  };

  for (let i = 0; i < 500; i++) await fn(); // V8 JIT warmup

  const stats = await measure(
    function* () {
      yield {
        async bench() {
          do_not_optimize(await fn());
        },
      };
    },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  );
  const rme = (stats as { rme?: number }).rme ?? 0;

  console.log(
    `${label}: avg=${stats.avg.toFixed(1)}ns p50=${stats.p50.toFixed(1)}ns rme=${rme.toFixed(2)}%`,
  );

  return stats.avg;
};

void (async () => {
  const base = await benchNavigate("A navigate 0-plugins", []);
  const b = await benchNavigate("B navigate 1-plugin-no-hooks", [() => ({})]);
  const c = await benchNavigate("C navigate 1-plugin-5-hooks", [fullHooksFactory()]);
  const d = await benchNavigate(
    "D navigate 10-plugins-5-hooks",
    Array.from({ length: 10 }, () => fullHooksFactory()),
  );

  // E) use+unsubscribe цикл
  {
    const router: Router = createRouter(ROUTES, { allowNotFound: false });

    await router.start("/a");

    const factory = fullHooksFactory();
    const fn = (): void => {
      const unsub = router.usePlugin(factory);

      unsub();
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
      `E use(5-hooks)+unsub cycle: avg=${stats.avg.toFixed(1)}ns p50=${stats.p50.toFixed(1)}ns rme=${rme.toFixed(2)}%`,
    );
  }

  console.log(
    `Δ per-navigate: 1-no-hooks=+${(b - base).toFixed(0)}ns; 1×5hooks=+${(c - base).toFixed(0)}ns; 10×5hooks=+${(d - base).toFixed(0)}ns (~${((d - base) / 10).toFixed(0)}ns/plugin)`,
  );
  console.log("probe-02 done");
})();
