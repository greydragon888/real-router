/**
 * ОПРОВЕРГАТЕЛЬ, дверь createRouter·options.queryParams.
 * Вопрос: ломает ли стратегия (а) — «прочитать мешок вызывающего ОДИН раз на
 * границе и держать собственную запись» — то, что пиненно
 * query-strategy-formats-1796.test.ts (арма «a DRIFT is confined to the clone»)
 * и «a drift to another VALID value diverges the clone SILENTLY (#2032)».
 *
 * (а) эмулируется СНАРУЖИ: снимок мешка берётся один раз ДО конструирования и
 * передаётся вместо живого мешка — ровно то, что ядро имело бы в собственной
 * записи, если бы cloneRouter брал снимок, а не перечитывал ручку.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

const routes = [{ name: "s", path: "/s?a" }];
const out: Record<string, unknown> = {};

// ── ПОЗИТИВНЫЙ КОНТРОЛЬ: валидный мешок переживает клон в ОБЕИХ армах ────────
const posBag = { arrayFormat: "brackets" };
const posBase = createRouter(routes, { queryParams: posBag } as never);
const posClone = cloneRouter(posBase);
out.posControl_liveArmCloneUrl = posClone.buildPath("s", {}, { a: ["x", "y"] });
posClone.dispose();
posBase.dispose();

const posBase2 = createRouter(routes, { queryParams: { ...posBag } } as never);
const posClone2 = cloneRouter(posBase2);
out.posControl_copyArmCloneUrl = posClone2.buildPath("s", {}, { a: ["x", "y"] });
posClone2.dispose();
posBase2.dispose();

// ── АРМА 1 пина: дрейф в НЕВАЛИДНОЕ значение обязан завалить клон ────────────
const mkDrifting = (): { arrayFormat: string } => {
  let reads = 0;
  return {
    get arrayFormat(): string {
      reads += 1;
      return reads <= 1 ? "brackets" : "bogusTypo";
    },
  };
};

{
  const live = createRouter(routes, { queryParams: mkDrifting() } as never);
  try {
    cloneRouter(live).dispose();
    out.live_invalidDrift_cloneThrew = false;
  } catch (error) {
    out.live_invalidDrift_cloneThrew = true;
    out.live_invalidDrift_message = (error as Error).message;
  }
  out.live_baseStillWorks = live.buildPath("s", {}, { a: ["x", "y"] });
  live.dispose();
}

{
  const bag = mkDrifting();
  const snapshot = { arrayFormat: bag.arrayFormat }; // единственное чтение
  const copied = createRouter(routes, { queryParams: snapshot } as never);
  try {
    const clone = cloneRouter(copied);
    out.copy_invalidDrift_cloneThrew = false;
    out.copy_invalidDrift_cloneUrl = clone.buildPath("s", {}, { a: ["x", "y"] });
    clone.dispose();
  } catch (error) {
    out.copy_invalidDrift_cloneThrew = true;
    out.copy_invalidDrift_message = (error as Error).message;
  }
  copied.dispose();
}

// ── АРМА 2 пина (#2032): дрейф в другое ВАЛИДНОЕ значение расходит клон молча ─
const mkMutable = (): Record<string, unknown> => {
  const bag = Object.create(null) as Record<string, unknown>;
  bag.arrayFormat = "brackets";
  return bag;
};

{
  const bag = mkMutable();
  const base = createRouter(routes, { queryParams: bag } as never);
  const before = cloneRouter(base);
  out.live_validDrift_beforeUrl = before.buildPath("s", {}, { a: ["x", "y"] });
  before.dispose();
  bag.arrayFormat = "none";
  const after = cloneRouter(base);
  out.live_validDrift_baseUrl = base.buildPath("s", {}, { a: ["x", "y"] });
  out.live_validDrift_afterCloneUrl = after.buildPath(
    "s",
    {},
    { a: ["x", "y"] },
  );
  after.dispose();
  base.dispose();
}

{
  const bag = mkMutable();
  const snapshot = { arrayFormat: bag.arrayFormat }; // граница: одно чтение
  const base = createRouter(routes, { queryParams: snapshot } as never);
  const before = cloneRouter(base);
  out.copy_validDrift_beforeUrl = before.buildPath("s", {}, { a: ["x", "y"] });
  before.dispose();
  bag.arrayFormat = "none"; // мутация мешка вызывающего — ядро её не видит
  const after = cloneRouter(base);
  out.copy_validDrift_baseUrl = base.buildPath("s", {}, { a: ["x", "y"] });
  out.copy_validDrift_afterCloneUrl = after.buildPath(
    "s",
    {},
    { a: ["x", "y"] },
  );
  after.dispose();
  base.dispose();
}

// ── ХЭНДАУТ: отдаётся ли мешок вызывающего по идентичности ──────────────────
{
  const bag = { arrayFormat: "brackets" };
  const r = createRouter(routes, { queryParams: bag } as never);
  const opts = getPluginApi(r).getOptions() as unknown as Record<
    string,
    unknown
  >;
  out.handout_getOptionsQueryParamsIsCallerBag = opts.queryParams === bag;
  r.dispose();
}

console.log(JSON.stringify(out, null, 1));
