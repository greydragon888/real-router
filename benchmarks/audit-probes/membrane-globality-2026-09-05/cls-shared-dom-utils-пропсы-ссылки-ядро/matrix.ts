// МАТРИЦА семейства «shared/dom-utils · пропсы <Link> → ядро».
// Строки: D1 resolveLinkTarget·to, D2 buildHref·routeParams|routeSearch,
//         D3 navigateWithHash·routeParams|routeSearch, D4 navigateWithHash·extraOptions.
// Столбцы: (a) копия-vs-оригинал, P1, P2, P3, P4.
//
// Все двери — функции shared/dom-utils/link-utils.ts, вызываемые <Link> шести адаптеров.
// Ядро под ними: Router.buildPath (D2), Router.isActiveRoute + Router.navigate (D3),
// Router.navigate·options → adoptNavigationOptions (D4). D1 в ядро не входит вовсе —
// его выход (params/search по ссылке) пересекает D2/D3.
import { createRouter } from "@real-router/core";

import {
  buildHref,
  navigateWithHash,
  resolveLinkTarget,
} from "../../../../shared/dom-utils/link-utils";
import {
  countingBag,
  countingProxy,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

import type { NavigationOptions, SearchParams } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id?tab" },
  { name: "v", path: "/v/:id?tab" },
];

function mk(): ReturnType<typeof createRouter> {
  return createRouter(routes as never, {} as never);
}

const out: Record<string, unknown> = {};

async function positiveControls(): Promise<void> {
  const r = mk();

  await r.start("/u/1?tab=a");

  const href = buildHref(r, "u", { id: "7" }, { tab: "x" }, "frag");
  const st = await navigateWithHash(
    r,
    "v",
    { id: "9" },
    { tab: "y" },
    undefined,
    { replace: true } as NavigationOptions,
  );

  out.PC = {
    // Позитивный контроль: заведомо легальные входы тем же кодом дают
    // настоящий href и настоящий коммит — двери достижимы из этой пробы.
    href,
    committedName: st.name,
    committedParams: { ...st.params },
    committedSearch: { ...st.search },
    committedPath: st.path,
    replaceSeen: st.transition?.replace,
  };
}

// ─────────────────────────── (a) копия против оригинала ───────────────────────────
async function experimentA(): Promise<void> {
  const leafArr = ["a", "b"];
  const leafObj = { k: 1 };

  async function run(shallowCopy: boolean): Promise<Record<string, unknown>> {
    const r = mk();

    await r.start("/home");
    await r.start === undefined; // no-op, держим порядок

    const appParams = { id: "7" };
    const appSearch = { tab: leafArr } as unknown as SearchParams;
    const appExtra = { replace: true, custom: leafObj } as NavigationOptions;
    const appTo = { name: "u", params: appParams, search: appSearch };

    const P = shallowCopy ? { ...appParams } : appParams;
    const S = shallowCopy
      ? ({ ...appSearch } as SearchParams)
      : (appSearch as SearchParams);
    const E = shallowCopy ? ({ ...appExtra } as NavigationOptions) : appExtra;
    const T = shallowCopy ? { ...appTo } : appTo;

    // D1
    const resolved = resolveLinkTarget(T as never, "", undefined, undefined);

    // D2
    const href = buildHref(r, resolved.name, P, S, "frag");

    // D3 + D4
    let hookOpts: NavigationOptions | undefined;
    let hookTo: unknown;

    r.usePlugin(() => ({
      onTransitionSuccess: (to: unknown, _from: unknown, opts: unknown) => {
        hookTo = to;
        hookOpts = opts as NavigationOptions;
      },
    }));

    const st = await navigateWithHash(r, "u", P, S, "frag", E);

    // Хэндауты СНИМАЮТСЯ ДО мутации (иначе арма-оригинал печатает мутацию,
    // потому что buildPath зовётся тем же объектом — артефакт пробы, не ядра).
    const handouts = {
      getStateParams: { ...r.getState()?.params },
      buildPathAgain: r.buildPath("u", P as never, S as never),
      isActive: r.isActiveRoute("u", { id: "7" } as never),
    };

    // Обратная видимость: мутируем ОРИГИНАЛ после вызова — видит ли ядро.
    appParams.id = "MUTATED";
    (appSearch as Record<string, unknown>).tab = "MUTATED";

    const afterOriginalMutation = {
      params: { ...r.getState()?.params },
      search: { ...r.getState()?.search },
      path: r.getState()?.path,
    };

    return {
      href,
      resolvedIdentityParams: resolved.params === (T as { params: unknown }).params,
      state: {
        name: st.name,
        params: { ...st.params },
        search: { ...st.search },
        path: st.path,
        contextKeys: Object.keys(st.context ?? {}),
        transitionReplace: st.transition?.replace,
      },
      identity: {
        stateParamsIsCallerBag: st.params === P,
        stateSearchIsCallerBag: st.search === S,
        // Листья по ссылке — это КОРРЕКТНО (семя 2).
        searchLeafIsAppArray:
          (st.search as Record<string, unknown> | undefined)?.tab === leafArr,
        hookOptsIsCallerBag: (hookOpts as unknown) === E,
        hookOptsCustomIsAppObject:
          (hookOpts as Record<string, unknown> | undefined)?.custom === leafObj,
        hookToIsState: hookTo === st,
      },
      handouts,
      frozen: {
        stateParams: Object.isFrozen(st.params),
        stateSearch: Object.isFrozen(st.search),
        callerParamsBag: Object.isFrozen(P),
        callerSearchBag: Object.isFrozen(S),
        callerExtraBag: Object.isFrozen(E),
        callerSearchLeafArray: Object.isFrozen(leafArr),
        callerOptsLeafObject: Object.isFrozen(leafObj),
        hookOpts: Object.isFrozen(hookOpts),
      },
      afterOriginalMutation,
    };
  }

  const orig = await run(false);
  const copy = await run(true);

  out.A = {
    original: orig,
    preCopied: copy,
    identicalObservables:
      JSON.stringify(orig) === JSON.stringify(copy)
        ? true
        : { orig, copy },
  };
}

// ─────────────────────────── P1 ───────────────────────────
async function p1(): Promise<void> {
  // D2: buildHref → Router.buildPath (fallback-рукав, без URL-плагина).
  const r = mk();

  await r.start("/u/1?tab=a");

  const pD2 = countingBag({ id: "7" });
  const sD2 = countingBag({ tab: "x" });
  const hrefD2 = buildHref(r, "u", pD2.bag, sD2.bag, "frag");

  // D2 дрейф: если чтений >1, дрейфующий вход выдаст расхождение в href.
  const pDrift = driftingBag({ id: "7" }, { id: "DRIFT" });
  const sDrift = driftingBag({ tab: "x" }, { tab: "DRIFT" });
  const hrefDrift = buildHref(r, "u", pDrift.bag, sDrift.bag);

  // D3 рукав «другой маршрут» (bypass НЕ срабатывает).
  const rB = mk();

  await rB.start("/home");

  const pB = countingBag({ id: "7" });
  const sB = countingBag({ tab: "x" });

  await navigateWithHash(rB, "u", pB.bag, sB.bag, "frag", undefined);

  // D3 рукав «то же место, hash-only» (bypass срабатывает: isActiveRoute + navigate).
  const pB2 = countingBag({ id: "7" });
  const sB2 = countingBag({ tab: "x" });

  await navigateWithHash(rB, "u", pB2.bag, sB2.bag, "other", undefined);

  // D3 дрейф на том же рукаве: предикат отвечает про ОДНО значение, коммит берёт ДРУГОЕ.
  const rC = mk();

  await rC.start("/u/7?tab=x");

  const pDrift3 = driftingBag({ id: "7" }, { id: "999" });
  const sDrift3 = driftingBag({ tab: "x" }, { tab: "DRIFT" });
  const stDrift3 = await navigateWithHash(
    rC,
    "u",
    pDrift3.bag,
    sDrift3.bag,
    "frag",
    undefined,
  );

  // D4: extraOptions.
  const rD = mk();

  await rD.start("/home");

  const eD = countingBag({ replace: true, custom: { k: 1 } });

  await navigateWithHash(rD, "u", { id: "7" }, undefined, undefined, eD.bag as NavigationOptions);

  // D1: дескриптор `to`.
  const to = countingBag({ name: "u", params: { id: "1" }, search: { tab: "x" } });
  const resolved = resolveLinkTarget(to.bag as never, "", undefined, undefined);
  const readsAfterResolve = { ...to.reads };
  const hrefD1 = buildHref(r, resolved.name, resolved.params as never, resolved.search);

  out.P1 = {
    D1: {
      readsAfterResolve,
      readsAfterBuildHref: { ...to.reads },
      hrefD1,
    },
    D2: {
      href: hrefD2,
      paramsReads: pD2.reads,
      searchReads: sD2.reads,
      driftHref: hrefDrift,
      driftParamsReads: pDrift.reads,
      driftSearchReads: sDrift.reads,
    },
    D3_otherRoute: { paramsReads: pB.reads, searchReads: sB.reads },
    D3_sameLocationHashOnly: { paramsReads: pB2.reads, searchReads: sB2.reads },
    D3_drift: {
      paramsReads: pDrift3.reads,
      searchReads: sDrift3.reads,
      committedParams: { ...stDrift3.params },
      committedSearch: { ...stDrift3.search },
      committedPath: stDrift3.path,
      transitionKeys: Object.keys(stDrift3.transition ?? {}),
      transition: { ...stDrift3.transition },
      stateBeforeDrift: "/u/7?tab=x",
    },
    D4: { extraReads: eD.reads },
  };
}

// ─────────────────────────── P2 ───────────────────────────
async function p2(): Promise<void> {
  // Лгущий Proxy: ownKeys НЕ называет ключ, getOwnPropertyDescriptor утверждает,
  // что он собственный и перечислимый. Ключ не должен попасть в состояние.
  function lyingProxy(
    visible: Record<string, unknown>,
    hidden: Record<string, unknown>,
  ): Record<string, unknown> {
    const all = { ...visible, ...hidden };

    return new Proxy(all, {
      ownKeys: () => Object.keys(visible),
      getOwnPropertyDescriptor: (t, k) =>
        typeof k === "string" && k in all
          ? { value: all[k], enumerable: true, configurable: true, writable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
    });
  }

  const r = mk();

  await r.start("/home");

  const pLie = lyingProxy({ id: "7" }, { ghost: "G" });
  const sLie = lyingProxy({ tab: "x" }, { ghostQ: "G" });
  const href = buildHref(r, "u", pLie as never, sLie as never);
  const st = await navigateWithHash(r, "u", pLie as never, sLie as never, undefined, undefined);

  const rD4 = mk();

  await rD4.start("/home");

  let hookOpts: NavigationOptions | undefined;

  rD4.usePlugin(() => ({
    onTransitionSuccess: (_t: unknown, _f: unknown, o: unknown) => {
      hookOpts = o as NavigationOptions;
    },
  }));

  const eLie = lyingProxy({ replace: true }, { ghostOpt: "G" });

  await navigateWithHash(rD4, "u", { id: "7" }, undefined, undefined, eLie as NavigationOptions);

  // D1: дескриптор через лгущий Proxy — читается по имени, ownKeys не участвует.
  const toLie = lyingProxy({ name: "u", params: { id: "3" } }, { search: { tab: "z" } });
  const resolvedLie = resolveLinkTarget(toLie as never, "", undefined, undefined);

  out.P2 = {
    D2: { href },
    D3: {
      committedParams: { ...st.params },
      committedSearch: { ...st.search },
      committedPath: st.path,
      ghostInParams: "ghost" in (st.params as object),
      ghostInSearch: "ghostQ" in (st.search as object),
    },
    D4: {
      hookOptsKeys: Object.keys(hookOpts ?? {}),
      ghostOptPresent: "ghostOpt" in (hookOpts ?? {}),
      transitionReplace: rD4.getState()?.transition?.replace,
    },
    D1: {
      // `to.search` невидим для ownKeys, но читается по ИМЕНИ → попадает в результат.
      resolvedSearch: resolvedLie.search,
      resolvedName: resolvedLie.name,
    },
  };
}

// ─────────────────────────── P3 ───────────────────────────
async function p3(): Promise<void> {
  const proto = Object.prototype as unknown as Record<string, unknown>;
  const hits: string[] = [];
  const res: Record<string, unknown> = {};

  // (1) унаследованный аксессор под именем ключа
  Object.defineProperty(proto, "id", {
    configurable: true,
    get(): unknown {
      return "INHERITED";
    },
    set(v: unknown): void {
      hits.push(`set:${String(v)}`);
    },
  });

  try {
    const r = mk();

    await r.start("/home");

    const st = await navigateWithHash(r, "u", { id: "7" }, { tab: "x" }, undefined, {
      replace: true,
    } as NavigationOptions);

    res.inheritedAccessor = {
      threw: false,
      setterHits: [...hits],
      committedParams: { ...st.params },
      committedPath: st.path,
      href: buildHref(r, "u", { id: "8" }, { tab: "y" }),
      // Доказательство, что ловушка стояла НА цепочке прототипов цели записи:
      committedParamsProtoIsObjectPrototype:
        Object.getPrototypeOf(st.params as object) === Object.prototype,
      // Позитивный контроль самой ловушки: объект без собственного "id"
      // ВИДИТ унаследованный геттер, а присваивание попадает в сеттер.
      trapLive: (() => {
        const probe: Record<string, unknown> = {};
        const seen = probe.id;
        probe.id = "TRAP";
        return { inheritedGetterSeen: seen, setterHitsNow: [...hits] };
      })(),
    };
  } catch (error) {
    res.inheritedAccessor = { threw: true, message: (error as Error).message };
  } finally {
    delete proto.id;
  }

  // (2) собственный ключ "__proto__" из JSON.parse
  const rr = mk();

  await rr.start("/home");

  const pollutedParams = JSON.parse('{"id":"7","__proto__":{"pwned":true}}') as Record<
    string,
    unknown
  >;
  const pollutedSearch = JSON.parse('{"tab":"x","__proto__":{"pwned":true}}') as Record<
    string,
    unknown
  >;
  const pollutedOpts = JSON.parse('{"replace":true,"__proto__":{"pwned":true}}') as Record<
    string,
    unknown
  >;

  const hrefP = buildHref(rr, "u", pollutedParams as never, pollutedSearch as never);
  const stP = await navigateWithHash(
    rr,
    "u",
    pollutedParams as never,
    pollutedSearch as never,
    undefined,
    pollutedOpts as NavigationOptions,
  );

  // D1 с "__proto__" в дескрипторе
  const toP = JSON.parse('{"name":"u","__proto__":{"pwned":true}}') as Record<string, unknown>;
  const resolvedP = resolveLinkTarget(toP as never, "", undefined, undefined);

  res.protoKey = {
    href: hrefP,
    committedParams: { ...stP.params },
    committedSearch: { ...stP.search },
    committedPath: stP.path,
    paramsProtoIsObjectPrototype:
      Object.getPrototypeOf(stP.params as object) === Object.prototype,
    paramsProtoIsNull: Object.getPrototypeOf(stP.params as object) === null,
    paramsHasPwned: "pwned" in (stP.params as object),
    globalPwned: ({} as Record<string, unknown>).pwned,
    d1ResolvedName: resolvedP.name,
    d1ResolvedParams: resolvedP.params,
  };

  out.P3 = res;
}

// ─────────────────────────── P4 ───────────────────────────
async function p4(): Promise<void> {
  const r = mk();

  await r.start("/home");

  const leafArray = ["a", "b"];
  const leafObject = { k: 1 };
  const callerParams = { id: "7" };
  const callerSearch = { tab: leafArray } as unknown as SearchParams;
  const callerOpts = { replace: true, custom: leafObject } as NavigationOptions;
  const callerTo = { name: "u", params: callerParams, search: callerSearch };

  const resolved = resolveLinkTarget(callerTo as never, "", undefined, undefined);

  buildHref(r, "u", callerParams, callerSearch, "frag");

  let hookOpts: NavigationOptions | undefined;

  r.usePlugin(() => ({
    onTransitionSuccess: (_t: unknown, _f: unknown, o: unknown) => {
      hookOpts = o as NavigationOptions;
    },
  }));

  const st = await navigateWithHash(
    r,
    "u",
    callerParams,
    callerSearch,
    "frag",
    callerOpts,
  );

  out.P4 = {
    coreProduced: {
      stateParamsFrozen: Object.isFrozen(st.params),
      stateSearchFrozen: Object.isFrozen(st.search),
      stateFrozen: Object.isFrozen(st),
      hookOptsFrozen: Object.isFrozen(hookOpts),
    },
    callerLevels: {
      callerParamsFrozen: Object.isFrozen(callerParams),
      callerSearchFrozen: Object.isFrozen(callerSearch),
      callerOptsFrozen: Object.isFrozen(callerOpts),
      callerToFrozen: Object.isFrozen(callerTo),
      callerSearchLeafArrayFrozen: Object.isFrozen(leafArray),
      callerOptsLeafObjectFrozen: Object.isFrozen(leafObject),
      resolvedShellFrozen: Object.isFrozen(resolved),
    },
    committedSearchLeafIsCallerArray:
      (st.search as Record<string, unknown> | undefined)?.tab === leafArray,
    committedSearchValue: JSON.stringify((st.search as Record<string, unknown>)?.tab),
    hookOptsCustomIsCallerObject:
      (hookOpts as Record<string, unknown> | undefined)?.custom === leafObject,
  };
}

async function main(): Promise<void> {
  await positiveControls();
  await experimentA();
  await p1();
  await p2();
  await p3();
  await p4();
  console.log(JSON.stringify(out, null, 1));
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
