// Триаж-батч: options·* / RoutesApi.update·* / codec-returns.
// Вопрос каждой секции: объект ВЫЗЫВАЮЩЕГО входит в состояние ядра (entry),
// или ядро отдаёт и читает обратно (roundtrip), или только отдаёт (handout)?
import { createRouter, RouterError } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

// ── A. createRouter·options + .queryParams + .limits + .logger ────────────
{
  const qp: Record<string, unknown> = { arrayFormat: "brackets" };
  const qpReads: string[] = [];
  const qpProxy = new Proxy(qp, {
    get(t, k) {
      qpReads.push(String(k));
      return Reflect.get(t, k) as unknown;
    },
  });
  const limitsBag: Record<string, unknown> = { maxListeners: 5 };
  const loggerBag = { level: "error-only" as const };
  const options = {
    queryParams: qpProxy as never,
    limits: limitsBag as never,
    logger: loggerBag,
    unknownKey: 1,
  };
  const router = createRouter(
    [{ name: "u", path: "/u/:id?tab" }] as never,
    options as never,
  );

  const got = getInternals(router).getOptions() as unknown as Record<
    string,
    unknown
  >;
  out["A · getOptions() !== caller options (контейнер скопирован)"] =
    (got as unknown) !== (options as unknown);
  out["A · getOptions() frozen"] = Object.isFrozen(got);
  out["A · unknown key survives the copy"] = got.unknownKey === 1;
  out["A · getOptions().queryParams === caller bag (ЛИСТ по ссылке)"] =
    got.queryParams === (qpProxy as unknown);
  out["A · getOptions().limits === caller bag (ЛИСТ по ссылке)"] =
    got.limits === (limitsBag as unknown);
  out["A · getOptions() has logger?"] = "logger" in got;
  out["A · queryParams reads at construction"] = [...qpReads];

  const before = qpReads.length;
  const clone = cloneRouter(router);
  out["A · queryParams EXTRA reads on cloneRouter"] = qpReads.slice(before);

  qp.arrayFormat = "index"; // мутируем мешок вызывающего ПОСЛЕ старта
  const mark = qpReads.length;
  const clone2 = cloneRouter(router);
  out["A · queryParams reads on 2nd clone (after caller mutation)"] =
    qpReads.slice(mark);
  out["A · clone2 sees MUTATED arrayFormat?"] = qp.arrayFormat;

  clone.dispose();
  clone2.dispose();
  router.dispose();
}

// ── B. RoutesApi.update·updates + .defaultSearch + .<customField> ─────────
{
  const router = createRouter([{ name: "u", path: "/u/:id?tab" }] as never);
  const ds: Record<string, unknown> = { tab: "x" };
  const custom = { a: 1 };
  const patch: Record<string, unknown> = { defaultSearch: ds, zz: custom };

  getRoutesApi(router).update("u", patch as never);

  const record = getPluginApi(router).getRouteConfig("u") as unknown as
    | Record<string, unknown>
    | undefined;
  out["B · custom record !== patch (контейнер ядра)"] =
    (record as unknown) !== (patch as unknown);
  out["B · custom leaf identity (record.zz === custom)"] = record?.zz === custom;

  patch.late = 1;
  const record2 = getPluginApi(router).getRouteConfig("u") as unknown as
    | Record<string, unknown>
    | undefined;
  out["B · late patch key invisible (патч не держится)"] =
    record2 !== undefined && !("late" in record2);

  const urlBefore = router.buildPath("u", { id: "1" });
  ds.tab = "MUTATED"; // мутируем мешок ВЫЗЫВАЮЩЕГО после update
  const urlAfter = router.buildPath("u", { id: "1" });
  out["B · buildPath before/after mutating caller's defaultSearch"] = [
    urlBefore,
    urlAfter,
  ];
  out["B · defaultSearch — ручка (мутация видна)"] = urlBefore !== urlAfter;

  // позитивный контроль: тот же ключ, легально изменённый через update
  getRoutesApi(router).update("u", { defaultSearch: { tab: "legit" } } as never);
  out["B · positive control (legal update prints)"] = router.buildPath("u", {
    id: "1",
  });
  router.dispose();
}

// ── C. Route.encodeParams·return / decodeParams·return ────────────────────
{
  let encReturn: unknown;
  let decReturn: unknown;
  const router = createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      encodeParams: (ch: {
        params: Record<string, unknown>;
        search: Record<string, unknown>;
      }) => {
        encReturn = {
          params: { ...ch.params, id: String(ch.params.id) + "E" },
          search: { ...ch.search },
        };

        return encReturn as never;
      },
      decodeParams: (ch: {
        params: Record<string, unknown>;
        search: Record<string, unknown>;
      }) => {
        decReturn = { params: { ...ch.params }, search: { ...ch.search } };

        return decReturn as never;
      },
    },
  ] as never);

  const url = router.buildPath("u", { id: "1" });
  out["C · encode return CONSUMED (URL carries E)"] = url;

  const matched = getPluginApi(router).matchPath("/u/7?tab=a") as unknown as
    | { params: Record<string, unknown>; search?: Record<string, unknown> }
    | undefined;
  out["C · match params"] = matched?.params;
  out["C · state.params !== decoder return.params (копия канала)"] =
    matched?.params !== (decReturn as { params: unknown } | undefined)?.params;
  out["C · decoder return recorded (вход дошёл)"] = decReturn !== undefined;
  out["C · encoder return recorded (вход дошёл)"] = encReturn !== undefined;

  // позитивный контроль: без кодеков URL другой
  const plain = createRouter([{ name: "u", path: "/u/:id?tab" }] as never);
  out["C · positive control (no codec)"] = plain.buildPath("u", { id: "1" });
  plain.dispose();
  router.dispose();
}

// ── D. cloneRouter·opts.logger ────────────────────────────────────────────
{
  const router = createRouter([{ name: "u", path: "/u" }] as never);
  const override = { level: "warn-error" as const, callback: (): void => {} };
  const clone = cloneRouter(router, { logger: override });
  out["D · clone built with logger override"] = clone !== router;

  // позитивный контроль: неизвестный ключ в override отвергается ядром
  try {
    cloneRouter(router, { logger: { bogus: 1 } as never }).dispose();
    out["D · unknown logger key accepted?"] = true;
  } catch (e) {
    out["D · unknown logger key REJECTED"] = (e as Error).message.slice(0, 100);
  }

  clone.dispose();
  router.dispose();
}

// ── E. RouterError.constructor·options ────────────────────────────────────
{
  const leaf = { deep: 1 };
  const bag: Record<string, unknown> = { message: "boom", extra: leaf };
  const err = new (RouterError as unknown as new (
    o: unknown,
  ) => Record<string, unknown>)(bag);
  out["E · instance !== options bag"] = (err as unknown) !== (bag as unknown);
  out["E · leaf by reference (err.extra === leaf)"] = err.extra === leaf;
  bag.late = 1;
  out["E · late key on caller bag invisible (контейнер скопирован)"] =
    !("late" in err);
}

console.log(JSON.stringify(out, null, 1));
