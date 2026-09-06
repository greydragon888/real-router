// ЦЕНА границы для двери RouterInternals.matchPath·options (alreadyCopied=no).
// A/B чередованием арм внутри одного процесса + A/A-пол.
//   base   — дверь получает мешок ВЫЗЫВАЮЩЕГО (как сегодня);
//   copy   — эмуляция горла: три именованных поля снимаются в свежий литерал
//            ОДИН раз на границе, дверь получает копию (стратегия (а));
//   aaFloor— второй прогон армы base (пол шума).
// Форма мешка — РЕАЛЬНАЯ для этой двери: ядро читает ровно три имени
// (RoutesNamespace.ts · matchPath: rewritePathOnMatch, trailingSlash,
// queryParamsMode).
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const r = createRouter([{ name: "u", path: "/u/:id?tab" }] as never, {} as never);
const ctx = getInternals(r);

const callerBag: Record<string, unknown> = {
  rewritePathOnMatch: true,
  trailingSlash: "always",
  queryParamsMode: "default",
};

/** Горло (а): один проход по трём именам в свежий литерал. */
const snapshot = (b: Record<string, unknown>): Record<string, unknown> => ({
  rewritePathOnMatch: b.rewritePathOnMatch,
  trailingSlash: b.trailingSlash,
  queryParamsMode: b.queryParamsMode,
});

const PATH = "/u/2?tab=a";
const armBase = (): unknown => ctx.matchPath(PATH, callerBag as never)?.path;
const armCopy = (): unknown =>
  ctx.matchPath(PATH, snapshot(callerBag) as never)?.path;

// позитивный контроль: обе армы дают ОДИН И ТОТ ЖЕ наблюдаемый результат
const control = { base: armBase(), copy: armCopy() };

const N = 20_000;
const REPS = 9;

function run(fn: () => unknown): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) {
    fn();
  }
  return Number(process.hrtime.bigint() - t0) / N;
}

// прогрев
for (let i = 0; i < 5; i += 1) {
  run(armBase);
  run(armCopy);
}

const base: number[] = [];
const copy: number[] = [];
const aa: number[] = [];
for (let i = 0; i < REPS; i += 1) {
  // ЧЕРЕДОВАНИЕ арм
  base.push(run(armBase));
  copy.push(run(armCopy));
  aa.push(run(armBase));
}

const median = (a: number[]): number =>
  [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const b = median(base);
const c = median(copy);
const a2 = median(aa);

console.log(
  JSON.stringify(
    {
      posControl: control,
      controlsAgree: control.base === control.copy && control.base === "/u/2/?tab=a",
      harness: `process.hrtime.bigint, N=${N}/арма, REPS=${REPS}, чередование base/copy/base, медианы`,
      shape: "3 ключа (rewritePathOnMatch, trailingSlash, queryParamsMode)",
      baselineNs: Number(b.toFixed(1)),
      withCopyNs: Number(c.toFixed(1)),
      aaFloorNs: Number(a2.toFixed(1)),
      deltaPct: Number((((c - b) / b) * 100).toFixed(2)),
      aaFloorPct: Number((((a2 - b) / b) * 100).toFixed(2)),
    },
    null,
    1,
  ),
);
r.dispose();
