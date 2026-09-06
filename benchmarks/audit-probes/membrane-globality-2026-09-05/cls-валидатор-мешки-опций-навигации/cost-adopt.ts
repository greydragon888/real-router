// C4 — изолированная цена ОДНОГО прохода горла на реальной форме мешка этой
// двери ({ replace: true }, один ключ). Нужна, чтобы показать: дельта 9,6–11,4 %
// из C3 — это ровно ОДНА лишняя копия, а перенос существующего вызова горла
// выше валидатора не добавляет ни одной.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//  npx tsx audit-probes/membrane-globality-2026-09-05/cls-валидатор-мешки-опций-навигации/cost-adopt.ts
import { adoptNavigationOptions } from "../../../../packages/core/src/helpers";

import type { NavigationOptions } from "@real-router/core/types";

const OPTS = { replace: true } as NavigationOptions;
let sink: unknown;

const N = 500_000;
const timeIt = (f: () => void): number => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) f();

  return Number(process.hrtime.bigint() - t0) / N;
};

const adopt = (): void => {
  sink = adoptNavigationOptions(OPTS);
};
// A/A-пол: та же работа, тот же вызов
const adoptAA = (): void => {
  sink = adoptNavigationOptions(OPTS);
};

for (let i = 0; i < 3; i++) {
  timeIt(adopt);
  timeIt(adoptAA);
}
const a: number[] = [];
const b: number[] = [];
for (let r = 0; r < 7; r++) {
  a.push(timeIt(adopt));
  b.push(timeIt(adoptAA));
}
const med = (xs: number[]): number =>
  [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
console.log(
  JSON.stringify(
    {
      harness:
        "process.hrtime.bigint · 500k вызовов на замер · 7 раундов · медиана",
      shape: "{ replace: true }",
      adoptNs: Number(med(a).toFixed(1)),
      aaNs: Number(med(b).toFixed(1)),
      aaFloorPct: Number((((med(b) - med(a)) / med(a)) * 100).toFixed(2)),
      raw: [
        a.map((x) => Number(x.toFixed(1))),
        b.map((x) => Number(x.toFixed(1))),
      ],
      sinkFrozen: Object.isFrozen(sink),
    },
    null,
    1,
  ),
);
