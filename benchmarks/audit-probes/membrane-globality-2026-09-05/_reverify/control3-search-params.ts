// Третья контрольная рука: packages/core/src/engine/search-params.
// Правило отбора объявлено ДО замера: экспортируемые функции области,
// чьи параметры допускают объект, сконструированный вызывающим.
// Вопрос: способна ли область предъявить P1 (двойное чтение контейнера
// вызывающего) — то, чего utils/fsm и utils/logger предъявить не могут.
import { build, makeOptions } from "../../../../packages/core/src/engine/search-params/index";

const drifting = <T extends object>(first: T, drifted: Partial<T>) => {
  const reads: Record<string, number> = {};
  const bag = {} as T;

  for (const k of Object.keys(first) as (keyof T & string)[]) {
    Object.defineProperty(bag, k, {
      enumerable: true,
      get() {
        reads[k] = (reads[k] ?? 0) + 1;

        return reads[k] === 1 ? first[k] : (drifted[k] ?? first[k]);
      },
    });
  }

  return { bag, reads };
};

const out: Record<string, unknown> = {};

// ── P1 на мешке ОПЦИЙ ────────────────────────────────────────────────────────
{
  const { bag, reads } = drifting(
    { arrayFormat: "brackets", booleanFormat: "none" } as never,
    { arrayFormat: "index" } as never,
  );
  const resolved = makeOptions(bag as never);

  out.options_reads = { ...reads };
  out.options_landed = (resolved as { arrayFormat?: string }).arrayFormat;
}

// ── ПОЗИТИВНЫЙ КОНТРОЛЬ: обычный мешок доходит и работает ───────────────────
{
  const r = makeOptions({ arrayFormat: "brackets" } as never);

  out.control_ordinary = (r as { arrayFormat?: string }).arrayFormat;
}

// ── P1 на мешке ПАРАМЕТРОВ ──────────────────────────────────────────────────
{
  const { bag, reads } = drifting({ id: "FIRST" } as never, { id: "DRIFT" } as never);

  out.params_href = build(bag as never);
  out.params_reads = { ...reads };
}
{
  out.control_params_ordinary = build({ id: "FIRST" } as never);
}

console.log(JSON.stringify(out, null, 1));
