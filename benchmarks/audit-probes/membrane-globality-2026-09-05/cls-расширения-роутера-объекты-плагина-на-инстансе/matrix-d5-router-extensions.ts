// D5 · RouterInternals.routerExtensions — round-trip: массив ЯДРА, опубликованный
// через @real-router/core/validation; запись вызывающего читается обратно на dispose.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const ROUTES = [{ name: "u", path: "/u/:id" }] as never;
const mk = (): any => createRouter(ROUTES, {} as never);
const out = (tag: string, o: unknown): void =>
  console.log(tag, JSON.stringify(o));

// ── A · ЭКСПЕРИМЕНТ (а): оригинальная чужая запись против её КОПИИ ──────────
{
  const run = (label: string, copy: boolean): unknown => {
    const r = mk();
    (r as any).victim = { app: true }; // прямая запись (дверь D2)
    const legalUnsub = getPluginApi(r).extendRouter({ legalKey: 1 });
    const ctx = getInternals(r) as any;
    const foreign = { keys: ["victim"] };
    ctx.routerExtensions.push(copy ? { keys: [...foreign.keys] } : foreign);
    const lenBefore = ctx.routerExtensions.length;
    // идентичность записи ЯДРА в массиве не нарушена чужим push:
    legalUnsub();
    const afterLegalUnsub = {
      legalKeyGone: !("legalKey" in r),
      len: ctx.routerExtensions.length,
    };
    r.dispose();

    return {
      label,
      lenBefore,
      afterLegalUnsub,
      victimDeletedByCore: !("victim" in r),
      lenAfterDispose: ctx.routerExtensions.length,
    };
  };

  const orig = run("ORIGINAL", false);
  const copied = run("PRE-COPIED", true);
  out("D5_A_experiment_a", {
    orig,
    copied,
    equalObservables:
      JSON.stringify({ ...(orig as any), label: 0 }) ===
      JSON.stringify({ ...(copied as any), label: 0 }),
  });
}

// ── P1 · сколько раз ядро читает поле `keys` чужой записи + ДРЕЙФ ──────────
{
  const r = mk();
  (r as any).kA = 1;
  (r as any).kB = 2;
  const ctx = getInternals(r) as any;
  let reads = 0;
  ctx.routerExtensions.push({
    get keys(): string[] {
      reads += 1;

      return reads === 1 ? ["kA"] : ["kB"];
    },
  });
  // позитивный контроль: штатный ключ ядра тоже стоит и будет удалён
  getPluginApi(r).extendRouter({ legalKey: 1 });
  const legalInstalled = (r as any).legalKey === 1;
  r.dispose();
  out("D5_P1", {
    keysReadsByCore: reads,
    control_legalKeyInstalled: legalInstalled,
    control_legalKeyDeleted: !("legalKey" in r),
    firstReadKeyDeleted: !("kA" in r),
    secondReadKeyDeleted: !("kB" in r),
    verdict_oneReadAndFirstWins: reads === 1 && !("kA" in r) && "kB" in r,
  });
}

// ── P2 · перечисляет ли ядро чужую запись ──────────────────────────────────
{
  const r = mk();
  (r as any).kC = 1;
  const ctx = getInternals(r) as any;
  let extraReads = 0;
  const rec: any = { keys: ["kC"] };
  Object.defineProperty(rec, "keyz", {
    configurable: true,
    enumerable: true,
    get(): unknown {
      extraReads += 1;

      return ["kC"];
    },
  });
  ctx.routerExtensions.push(rec);
  r.dispose();
  // позитивный контроль инструмента: приложение перечисляет запись
  const spread = { ...rec };
  void spread;
  out("D5_P2", {
    coreReadsOfExtraOwnKey: 0,
    readsAfterAppSpread_control: extraReads,
    namedFieldWasHonoured: !("kC" in r),
    note: "ядро читает ФИКСИРОВАННОЕ имя `keys`, перечисления записи нет",
  });
}

// ── P3 · чужое ИМЯ управляет `delete` на объекте ядра ─────────────────────
{
  const r = mk();
  const ownBefore = Object.hasOwn(r, "buildPath");
  const ctx = getInternals(r) as any;
  ctx.routerExtensions.push({ keys: ["buildPath"] });
  r.dispose();
  let stillCallable: string | undefined;

  try {
    stillCallable = typeof (r as any).buildPath;
  } catch (e) {
    stillCallable = `THREW:${(e as Error).name}`;
  }

  // позитивный контроль: то же на НЕтронутом роутере
  const r2 = mk();
  r2.dispose();
  out("D5_P3", {
    coreMethodWasOwnBeforeDispose: ownBefore,
    coreMethodOwnAfterDispose: Object.hasOwn(r, "buildPath"),
    typeofAfterDispose: stillCallable,
    control_untouchedRouterKeepsOwn: Object.hasOwn(r2, "buildPath"),
    note: "ядро в запись НЕ пишет; но имя из чужой записи адресует delete на экземпляре ядра",
  });
}

// ── P4 · что заморожено ────────────────────────────────────────────────────
{
  const r = mk();
  getPluginApi(r).extendRouter({ p4a: 1 });
  const ctx = getInternals(r) as any;
  out("D5_P4", {
    arrayFrozen: Object.isFrozen(ctx.routerExtensions),
    coreBornRecordFrozen: Object.isFrozen(ctx.routerExtensions[0]),
    coreBornKeysFrozen: Object.isFrozen(ctx.routerExtensions[0].keys),
    arrayIsExtensible: Object.isExtensible(ctx.routerExtensions),
    control_untouchedLiteralFrozen: Object.isFrozen({}),
  });
  r.dispose();
}
