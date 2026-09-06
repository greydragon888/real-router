// ЦЕНА стратегии (а) на трёх ГОРЯЧИХ дверях семейства с alreadyCopied=partial:
//   navigate·routeParams, PluginApi.makeState·params, PluginApi.buildNavigationState·params.
// Арма A — дверь с ОРИГИНАЛЬНЫМ мешком (сегодня); арма B — та же дверь с
// `{...bag}` на границе (эмуляция лишней копии контейнера, src НЕ правится).
// Форма мешка — РЕАЛЬНАЯ для этих дверей: 1 и 2 ключа (не пять).
//
// Протокол: чередование арм по раундам, медианы, A/A-пол (две одинаковые армы A
// прогоняются как A1/A2 — их расхождение и есть пол шума).
import { performance } from "node:perf_hooks";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "two", path: "/two/:id/:slug" },
  { name: "plain", path: "/plain/:id" },
] as never;

const ROUNDS = 9;
const ITERS = 20_000;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
};

type Arm = { label: string; fn: () => void };

/** Чередует армы по раундам, возвращает медиану ns/op по каждой. */
function race(arms: Arm[], iters: number): Record<string, number> {
  const acc: Record<string, number[]> = {};
  for (const a of arms) acc[a.label] = [];

  // прогрев
  for (const a of arms) for (let i = 0; i < iters; i++) a.fn();

  for (let r = 0; r < ROUNDS; r++) {
    for (const a of arms) {
      const t0 = performance.now();
      for (let i = 0; i < iters; i++) a.fn();
      const t1 = performance.now();
      acc[a.label].push(((t1 - t0) * 1e6) / iters);
    }
  }
  const out: Record<string, number> = {};
  for (const a of arms) out[a.label] = median(acc[a.label]);
  return out;
}

const report: Record<string, unknown> = {};

const measure = (
  name: string,
  shape: string,
  door: (bag: Bag) => void,
  bag: Bag,
  iters = ITERS,
) => {
  const r = race(
    [
      { label: "A1·original", fn: () => door(bag) },
      { label: "B·copyAtBoundary", fn: () => door({ ...bag }) },
      { label: "A2·original", fn: () => door(bag) },
    ],
    iters,
  );
  const baseline = (r["A1·original"] + r["A2·original"]) / 2;
  const withCopy = r["B·copyAtBoundary"];
  const aaFloorPct =
    (Math.abs(r["A1·original"] - r["A2·original"]) / baseline) * 100;
  report[name] = {
    shape,
    baselineNs: +baseline.toFixed(1),
    withCopyNs: +withCopy.toFixed(1),
    deltaPct: +(((withCopy - baseline) / baseline) * 100).toFixed(2),
    aaFloorPct: +aaFloorPct.toFixed(2),
    raw: r,
    harness: `самописный alternating-median, ${ROUNDS} раундов × ${iters} итераций, performance.now`,
  };
};

async function main(): Promise<void> {
  // ---- PluginApi.buildNavigationState (per-render через router.buildUrl) ----
  {
    const api = getPluginApi(createRouter(ROUTES, {} as never));
    // позитивный контроль: дверь действительно отрабатывает
    const ctl = api.buildNavigationState("u", { id: "7" } as never);
    report["control·buildNavigationState"] = (ctl as { path: string }).path;
    measure(
      "PluginApi.buildNavigationState·params",
      "1 ключ { id }",
      (bag) => {
        api.buildNavigationState("u", bag as never);
      },
      { id: "7" },
    );
    measure(
      "PluginApi.buildNavigationState·params (2 ключа)",
      "2 ключа { id, slug }",
      (bag) => {
        api.buildNavigationState("two", bag as never);
      },
      { id: "7", slug: "a" },
    );
  }

  // ---- PluginApi.makeState (per-popstate) ----
  {
    const api = getPluginApi(createRouter(ROUTES, {} as never));
    const ctl = api.makeState(
      "u",
      { id: "7" } as never,
      undefined as never,
      "/u/7",
    );
    report["control·makeState"] = (ctl as { name: string }).name;
    measure(
      "PluginApi.makeState·params",
      "1 ключ { id }",
      (bag) => {
        api.makeState("u", bag as never, undefined as never, "/u/7");
      },
      { id: "7" },
    );
  }

  // ---- Router.navigate (per-navigation; async — меньше итераций) ----
  {
    const r = createRouter(ROUTES, {} as never);
    r.start("/plain/1");
    const ctl = await r.navigate("u", { id: "7" } as never);
    report["control·navigate"] = (ctl as { path: string }).path;

    const NAV_ROUNDS = 9;
    const NAV_ITERS = 2_000;
    const acc: Record<string, number[]> = {
      "A1·original": [],
      "B·copyAtBoundary": [],
      "A2·original": [],
    };
    const bagA: Bag = { id: "7" };
    const run = async (copy: boolean, n: number) => {
      for (let i = 0; i < n; i++) {
        // чередуем цель, иначе SAME_STATES короткозамыкает навигацию
        const target = i % 2 === 0 ? "plain" : "u";
        const bag = target === "u" ? bagA : { id: String(i) };
        await r.navigate(target, (copy ? { ...bag } : bag) as never);
      }
    };
    await run(false, 500);
    await run(true, 500);
    for (let round = 0; round < NAV_ROUNDS; round++) {
      for (const [label, copy] of [
        ["A1·original", false],
        ["B·copyAtBoundary", true],
        ["A2·original", false],
      ] as [string, boolean][]) {
        const t0 = performance.now();
        await run(copy, NAV_ITERS);
        const t1 = performance.now();
        acc[label].push(((t1 - t0) * 1e6) / NAV_ITERS);
      }
    }
    const b =
      (median(acc["A1·original"]) + median(acc["A2·original"])) / 2;
    const w = median(acc["B·copyAtBoundary"]);
    report["Router.navigate·routeParams"] = {
      shape: "1 ключ { id }",
      baselineNs: +b.toFixed(1),
      withCopyNs: +w.toFixed(1),
      deltaPct: +(((w - b) / b) * 100).toFixed(2),
      aaFloorPct: +(
        (Math.abs(median(acc["A1·original"]) - median(acc["A2·original"])) / b) *
        100
      ).toFixed(2),
      harness: `самописный alternating-median, ${NAV_ROUNDS} раундов × ${NAV_ITERS} навигаций, performance.now`,
    };
  }

  console.log(JSON.stringify(report, null, 1));
}

void main();
