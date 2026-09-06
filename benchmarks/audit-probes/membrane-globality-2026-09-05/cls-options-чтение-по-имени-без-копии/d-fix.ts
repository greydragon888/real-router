// ДОПОЛНЕНИЕ к matrix.ts, секция D (RouterInternals.matchPath·options).
// В matrix.ts контроль секции D НЕ ДИСКРИМИНИРОВАЛ: вход "/u/2?tab=a" уже
// канонический, поэтому `rewritePathOnMatch: true` и `false` дают одну и ту же
// строку — «дошёл ли вход до ветки» доказано не было.
// Здесь контроль сделан различающим через `trailingSlash: "always"`:
// с rewritePathOnMatch=true путь переписывается со слэшем, с false — нет.
// Плюс главный эксперимент семейства: ручка держится ЧЕРЕЗ код приложения —
// RoutesNamespace.ts · matchPath читает opts.rewritePathOnMatch ДО кодировщика
// маршрута, а opts.trailingSlash / opts.queryParamsMode — ПОСЛЕ него.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};
const ROUTES = [{ name: "u", path: "/u/:id?tab" }];

const mk = (routes: unknown = ROUTES): any =>
  createRouter(routes as never, {} as never);

// --- ШАПКА: РАЗЛИЧАЮЩИЙ позитивный контроль -------------------------------
{
  const r = mk();
  const ctx = getInternals(r);
  const base = ctx.getOptions() as unknown as Record<string, unknown>;
  const on = ctx.matchPath("/u/2?tab=a", {
    ...base,
    rewritePathOnMatch: true,
    trailingSlash: "always",
  } as never);
  const off = ctx.matchPath("/u/2?tab=a", {
    ...base,
    rewritePathOnMatch: false,
    trailingSlash: "always",
  } as never);

  out.HEADER = {
    withRewrite: on?.path,
    withoutRewrite: off?.path,
    discriminating: on?.path !== off?.path,
  };
  r.dispose();
}

// --- (а): оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера --------
{
  const r = mk();
  const ctx = getInternals(r);
  const base = ctx.getOptions() as unknown as Record<string, unknown>;
  const orig: Record<string, unknown> = {
    ...base,
    rewritePathOnMatch: true,
    trailingSlash: "always",
  };
  const copy = { ...orig };

  const sOrig = ctx.matchPath("/u/2?tab=a", orig as never);
  const sCopy = ctx.matchPath("/u/2?tab=a", copy as never);

  // ОБРАТНАЯ ВИДИМОСТЬ: мутируем оригинал ПОСЛЕ вызова
  orig.trailingSlash = "never";
  const sAfter = ctx.matchPath("/u/2?tab=a", orig as never);
  // и проверяем, что ничего не осело в кэше ядра (#1980)
  const buildPathAfter = r.buildPath("u", { id: "4" });
  const coreOwnMatch = ctx.matchPath("/u/2?tab=a", base as never);

  out.exp_a = {
    origPath: sOrig?.path,
    copyPath: sCopy?.path,
    equal: sOrig?.path === sCopy?.path,
    paramsEqual:
      JSON.stringify(sOrig?.params) === JSON.stringify(sCopy?.params),
    searchEqual:
      JSON.stringify(sOrig?.search) === JSON.stringify(sCopy?.search),
    afterMutation_nextCallSeesIt: sAfter?.path,
    routerBuildPathUnaffected: buildPathAfter,
    coreOwnOptionsMatch: coreOwnMatch?.path,
    callerOptsFrozen_mustBeFalse: Object.isFrozen(orig),
  };
  r.dispose();
}

// --- (б)-ЭКСПОЗИЦИЯ: код приложения между двумя чтениями ОДНОГО мешка -----
// Кодировщик маршрута исполняется ПОСЛЕ чтения opts.rewritePathOnMatch и ДО
// чтения opts.trailingSlash. Он мутирует мешок вызывающего — ядро обязано
// увидеть НОВОЕ значение, если ручка действительно держится.
{
  let mutated: Record<string, unknown> | undefined;
  const r = mk([
    {
      name: "u",
      path: "/u/:id?tab",
      encodeParams: (ch: unknown) => {
        if (mutated) {
          mutated.trailingSlash = "never";
        }
        return ch;
      },
    },
  ]);
  const ctx = getInternals(r);
  const base = ctx.getOptions() as unknown as Record<string, unknown>;

  // позитивный контроль: без мутации слэш ставится
  const control = ctx.matchPath("/u/2?tab=a", {
    ...base,
    rewritePathOnMatch: true,
    trailingSlash: "always",
  } as never);

  mutated = { ...base, rewritePathOnMatch: true, trailingSlash: "always" };
  const exposed = ctx.matchPath("/u/2?tab=a", mutated as never);

  out.midFrameExposure = {
    posControl_noMutation: control?.path,
    withMidFrameMutation: exposed?.path,
    coreHonouredTheSecondValue: control?.path !== exposed?.path,
    bagValueAtEnd: mutated.trailingSlash,
  };
  r.dispose();
}

// --- P1 на РАЗЛИЧАЮЩЕЙ форме: счёт на ключ за ОДИН кадр -------------------
{
  const r = mk();
  const ctx = getInternals(r);
  const base = ctx.getOptions() as unknown as Record<string, unknown>;
  const reads: Record<string, number> = {};
  const src: Record<string, unknown> = {
    ...base,
    rewritePathOnMatch: true,
    trailingSlash: "always",
  };
  const bag: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    Object.defineProperty(bag, k, {
      enumerable: true,
      configurable: true,
      get: () => {
        reads[k] = (reads[k] ?? 0) + 1;
        return src[k];
      },
    });
  }
  const s = ctx.matchPath("/u/2?tab=a", bag as never);

  out.p1 = {
    readsInOneFrame: reads,
    maxReadsPerKey: Math.max(...Object.values(reads)),
    posControl_path: s?.path,
  };
  r.dispose();
}

console.log(JSON.stringify(out, null, 1));
