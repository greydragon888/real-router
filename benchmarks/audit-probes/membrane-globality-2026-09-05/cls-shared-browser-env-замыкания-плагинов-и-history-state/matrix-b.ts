// МАТРИЦА B — семейство «shared/browser-env·history.state»:
//   D5 popstate-utils.getRouteFromEvent·evt.state
//   D6 canSkipPopstateHistoryWrite·browser.getState()
// Столбцы: (a) копия-vs-оригинал, P1, P2, P3, P4.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  canSkipPopstateHistoryWrite,
  getRouteFromEvent,
} from "../../../../shared/browser-env/popstate-utils";
import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

import type { Browser } from "../../../../shared/browser-env/types";
import type { State } from "@real-router/core";

const out = (tag: string, v: unknown): void =>
  console.log(tag, JSON.stringify(v));

function lyingProxy(
  target: Record<string, unknown>,
  hidden: Record<string, unknown>,
): {
  bag: Record<string, unknown>;
  gopd: string[];
  counters: { ownKeys: number };
} {
  const gopd: string[] = [];
  const counters = { ownKeys: 0 };
  const bag = new Proxy(target, {
    ownKeys(t) {
      counters.ownKeys += 1;

      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      if (typeof k === "string") {
        gopd.push(k);

        if (Object.hasOwn(hidden, k)) {
          return {
            value: hidden[k],
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
      }

      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    has(t, k) {
      return (
        (typeof k === "string" && Object.hasOwn(hidden, k)) || Reflect.has(t, k)
      );
    },
    get(t, k, r): unknown {
      if (typeof k === "string" && Object.hasOwn(hidden, k)) {
        return hidden[k];
      }

      return Reflect.get(t, k, r);
    },
  });

  return { bag, gopd, counters };
}

function withInheritedAccessor<T>(
  name: string,
  run: (log: { get: number; set: unknown[] }) => T,
): T {
  const log = { get: 0, set: [] as unknown[] };

  Object.defineProperty(Object.prototype, name, {
    get() {
      log.get += 1;

      return "FROM_PROTO";
    },
    set(v: unknown) {
      log.set.push(v);
    },
    configurable: true,
  });

  try {
    return run(log);
  } finally {
    delete (Object.prototype as Record<string, unknown>)[name];
  }
}

const asEvent = (state: unknown): PopStateEvent => ({ state }) as PopStateEvent;

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );

  await router.start("/u/1");

  const api = getPluginApi(router);

  // ═══ D5 ═══════════════════════════════════════════════════════════════════
  // ── ШАПКА / позитивный контроль ───────────────────────────────────────────
  const legal = {
    name: "u",
    params: { id: "7" },
    search: { tab: "x" },
    path: "/u/7?tab=x",
  };
  const sLegal = getRouteFromEvent(asEvent(legal), api, "/");

  out("H5", {
    restored: sLegal?.name,
    path: sLegal?.path,
    params: sLegal?.params,
    search: sLegal?.search,
    fallbackNotTaken: sLegal?.path === legal.path,
  });

  // ── D5 · (a) копия vs оригинал ────────────────────────────────────────────
  const origEntry = {
    name: "u",
    params: { id: "7" },
    search: { tab: "x" },
    path: "/u/7?tab=x",
  };
  const copiedEntry = {
    ...origEntry,
    params: { ...origEntry.params },
    search: { ...origEntry.search },
  };
  const sOrig = getRouteFromEvent(asEvent(origEntry), api, "/");
  const sCopy = getRouteFromEvent(asEvent(copiedEntry), api, "/");

  // мутация ОРИГИНАЛА после вызова — видит ли ядро
  origEntry.params.id = "MUTATED";
  const committed = sOrig
    ? await api.navigateToState(sOrig, { replace: true })
    : undefined;

  out("D5a", {
    sameName: sOrig?.name === sCopy?.name,
    samePath: sOrig?.path === sCopy?.path,
    sameParams: JSON.stringify(sOrig?.params) === JSON.stringify(sCopy?.params),
    sameSearch: JSON.stringify(sOrig?.search) === JSON.stringify(sCopy?.search),
    paramsIdentityWithCaller: sOrig?.params === origEntry.params,
    afterCallerMutation: sOrig?.params,
    committedPath: committed?.path,
    committedParams: committed?.params,
    getStateIsCommitted: router.getState() === committed,
    callerEntryFrozen: Object.isFrozen(origEntry),
    callerParamsFrozen: Object.isFrozen(copiedEntry.params),
  });

  // ── D5 · P1 (чтения: верхний уровень записи vs вложенные мешки) ───────────
  const p5 = countingBag({ id: "7" });
  const s5 = countingBag({ tab: "x" });
  const entry5 = countingBag({
    name: "u",
    params: p5.bag,
    search: s5.bag,
    path: "/u/7?tab=x",
  });
  const sCount = getRouteFromEvent(asEvent(entry5.bag), api, "/");

  // ДРЕЙФ вложенного мешка: гвард видит примитив, normalizeChannel — функцию
  const drift5 = driftingBag({ id: "7" }, { id: (() => 1) as never });
  const sDrift = getRouteFromEvent(
    asEvent({ name: "u", params: drift5.bag, search: {}, path: "/u/7" }),
    api,
    "/",
  );
  // ДРЕЙФ значения: гвард одобряет "7", коммитится "999"
  const drift5b = driftingBag({ id: "7" }, { id: "999" });
  const sDrift2 = getRouteFromEvent(
    asEvent({ name: "u", params: drift5b.bag, search: {}, path: "/u/7" }),
    api,
    "/",
  );

  out("D5p1", {
    entryReads: entry5.reads,
    nestedParamsReads: p5.reads,
    nestedSearchReads: s5.reads,
    restored: sCount?.name,
    driftReads: drift5.reads,
    driftCommittedIdType: typeof sDrift?.params.id,
    driftValueReads: drift5b.reads,
    driftCommittedId: sDrift2?.params.id,
    driftPath: sDrift2?.path,
  });

  // ── D5 · P2 (лгущий Proxy на вложенном мешке params) ─────────────────────
  const lyP5 = lyingProxy({ id: "7" }, { evil: "boom" });
  const sLy = getRouteFromEvent(
    asEvent({ name: "u", params: lyP5.bag, search: {}, path: "/u/7" }),
    api,
    "/",
  );
  // тот же приём, но скрытый ключ — ОБЪЯВЛЕННОЕ query-имя маршрута ("tab"),
  // о котором findMisChanneledKey спрашивает hasOwn (ключ выбирает ЯДРО)
  const lyP5b = lyingProxy({ id: "7" }, { tab: "SNEAK" });
  let lyThrow: string | undefined;
  let sLyB: State | undefined;

  try {
    sLyB = getRouteFromEvent(
      asEvent({ name: "u", params: lyP5b.bag, search: {}, path: "/u/7" }),
      api,
      "/",
    );
  } catch (error) {
    lyThrow = (error as Error).message.slice(0, 80);
  }

  // позитивный контроль той же ветки: ЧЕСТНЫЙ мешок с реальным "tab" в params
  let honestThrow: string | undefined;

  try {
    getRouteFromEvent(
      asEvent({
        name: "u",
        params: { id: "7", tab: "x" },
        search: {},
        path: "/u/7",
      }),
      api,
      "/",
    );
  } catch (error) {
    honestThrow = (error as Error).message.slice(0, 80);
  }

  out("D5p2", {
    committedParams: sLy?.params,
    evilCommitted: sLy?.params.evil,
    gopdAsked: lyP5.gopd,
    lyingDeclaredKeyThrow: lyThrow,
    lyingDeclaredKeyGopd: lyP5b.gopd,
    lyingResult: sLyB?.params,
    honestControlThrow: honestThrow,
  });

  // ── D5 · P3 ───────────────────────────────────────────────────────────────
  const d5p3 = withInheritedAccessor("id", (log) => {
    const st = getRouteFromEvent(
      asEvent({ name: "u", params: { id: "own" }, search: {}, path: "/u/own" }),
      api,
      "/",
    );

    return {
      params: st?.params,
      ownIdKey: st ? Object.hasOwn(st.params, "id") : undefined,
      protoSetCalls: log.set,
      protoGetCalls: log.get,
    };
  });
  const poisoned = JSON.parse('{"__proto__":{"pollutedB":1},"id":"8"}') as Record<
    string,
    unknown
  >;
  const sPoison = getRouteFromEvent(
    asEvent({ name: "u", params: poisoned, search: {}, path: "/u/8" }),
    api,
    "/",
  );

  out("D5p3", {
    ...d5p3,
    poisonParams: sPoison?.params,
    poisonOwnProto: sPoison
      ? Object.hasOwn(sPoison.params, "__proto__")
      : undefined,
    poisonProtoIsObjectProto: sPoison
      ? Object.getPrototypeOf(sPoison.params) === Object.prototype
      : undefined,
    globalPollutedB: ({} as Record<string, unknown>).pollutedB,
  });

  // ── D5 · P4 ───────────────────────────────────────────────────────────────
  const nested5 = { deep: { k: 1 } };
  const entryP4 = {
    name: "u",
    params: { id: "7", extra: nested5 } as unknown as Record<string, unknown>,
    search: { tab: "x" },
    path: "/u/7?tab=x",
  };
  const sP4 = getRouteFromEvent(asEvent(entryP4), api, "/");

  out("D5p4", {
    callerEntryFrozen: Object.isFrozen(entryP4),
    callerParamsFrozen: Object.isFrozen(entryP4.params),
    callerNestedFrozen: Object.isFrozen(nested5),
    coreParamsFrozen: Object.isFrozen(sP4?.params),
    coreSearchFrozen: Object.isFrozen(sP4?.search),
    coreLeafFrozen: Object.isFrozen(
      (sP4?.params as Record<string, unknown> | undefined)?.extra,
    ),
  });

  // ═══ D6 ═══════════════════════════════════════════════════════════════════
  await router.navigate("u", { id: "1" });
  const toState = router.getState() as State;

  const mkBrowser = (state: unknown): Browser =>
    ({ getState: () => state }) as unknown as Browser;
  const skip = (state: unknown): boolean =>
    canSkipPopstateHistoryWrite(toState, mkBrowser(state), router.areStatesEqual);

  // ── ШАПКА / позитивный контроль ───────────────────────────────────────────
  const match = { name: "u", params: { id: "1" }, search: {}, path: toState.path };
  const mismatch = {
    name: "u",
    params: { id: "999" },
    search: {},
    path: toState.path,
  };

  out("H6", {
    toStatePath: toState.path,
    toStateParams: toState.params,
    skipOnMatch: skip(match),
    skipOnMismatch: skip(mismatch),
    skipOnCorrupt: skip({ name: 1, params: {}, path: "/u/1" }),
    skipNoReader: canSkipPopstateHistoryWrite(
      toState,
      {} as unknown as Browser,
      router.areStatesEqual,
    ),
  });

  // ── D6 · (a) копия vs оригинал ────────────────────────────────────────────
  const liveOrig = {
    name: "u",
    params: { id: "1" },
    search: {},
    path: toState.path,
  };
  const liveCopy = {
    ...liveOrig,
    params: { ...liveOrig.params },
    search: { ...liveOrig.search },
  };

  out("D6a", {
    skipOrig: skip(liveOrig),
    skipCopy: skip(liveCopy),
    equal: skip(liveOrig) === skip(liveCopy),
    liveFrozenAfter: Object.isFrozen(liveOrig),
    liveParamsFrozenAfter: Object.isFrozen(liveOrig.params),
    landsInCore: router.getState() === toState,
  });

  // ── D6 · P1 ───────────────────────────────────────────────────────────────
  const lp = countingBag({ id: "1" });
  const ls = countingBag({});
  const liveCount = countingBag({
    name: "u",
    params: lp.bag,
    search: ls.bag,
    path: toState.path,
  });
  const skipCounted = skip(liveCount.bag);

  // ДРЕЙФ: гвард валидирует НЕсовпадающую запись, сравнение берёт совпадающую
  const liveDrift = driftingBag(
    {
      name: "u",
      params: { id: "999" },
      search: {},
      path: toState.path,
    },
    { params: { id: "1" } },
  );
  const skipDrift = skip(liveDrift.bag);
  // и наоборот: гвард видит совпадающую, сравнение — другую
  const liveDrift2 = driftingBag(
    { name: "u", params: { id: "1" }, search: {}, path: toState.path },
    { params: { id: "999" } },
  );
  const skipDrift2 = skip(liveDrift2.bag);
  // дрейф path: гвард видит строку, гейт сравнивает другую
  const liveDrift3 = driftingBag(
    { name: "u", params: { id: "1" }, search: {}, path: toState.path },
    { path: "/TOTALLY/OTHER" },
  );
  const skipDrift3 = skip(liveDrift3.bag);

  out("D6p1", {
    liveReads: liveCount.reads,
    nestedParamsReads: lp.reads,
    nestedSearchReads: ls.reads,
    skipCounted,
    honestMismatchSkip: skip(mismatch),
    driftGuardSawMismatch_skip: skipDrift,
    driftReads: liveDrift.reads,
    driftGuardSawMatch_skip: skipDrift2,
    driftPath_skip: skipDrift3,
    driftPathReads: liveDrift3.reads,
  });

  // ── D6 · P2 ───────────────────────────────────────────────────────────────
  const lyLiveParams = lyingProxy({ id: "1" }, { evil: "boom" });
  const skipLy = skip({
    name: "u",
    params: lyLiveParams.bag,
    search: {},
    path: toState.path,
  });
  const lyLive = lyingProxy(
    { name: "u", params: { id: "1" }, search: {}, path: toState.path },
    { bogus: "x" },
  );
  const skipLyEntry = skip(lyLive.bag);

  out("D6p2", {
    skipWithLyingParams: skipLy,
    honestSameShapeSkip: skip({
      name: "u",
      params: { id: "1" },
      search: {},
      path: toState.path,
    }),
    lyingParamsGopd: lyLiveParams.gopd,
    skipWithLyingEntry: skipLyEntry,
    lyingEntryGopd: lyLive.gopd,
  });

  // ── D6 · P3 ───────────────────────────────────────────────────────────────
  const d6p3 = withInheritedAccessor("id", (log) => {
    const r = skip({
      name: "u",
      params: { id: "1" },
      search: {},
      path: toState.path,
    });

    return { skip: r, protoSetCalls: log.set, protoGetCalls: log.get };
  });
  // legacy-рукав (нет search) → spread-копия `{ ...live, search: {} }`
  const legacyPoison = JSON.parse(
    '{"__proto__":{"pollutedC":1},"name":"u","path":"/x","params":{"id":"1"}}',
  ) as Record<string, unknown>;

  legacyPoison.path = toState.path;
  const skipLegacy = skip(legacyPoison);

  out("D6p3", {
    ...d6p3,
    legacyArmSkip: skipLegacy,
    globalPollutedC: ({} as Record<string, unknown>).pollutedC,
    legacyStillOwnProto: Object.hasOwn(legacyPoison, "__proto__"),
  });

  // ── D6 · P4 ───────────────────────────────────────────────────────────────
  const liveP4 = {
    name: "u",
    params: { id: "1" },
    search: {},
    path: toState.path,
  };

  skip(liveP4);
  out("D6p4", {
    liveFrozen: Object.isFrozen(liveP4),
    liveParamsFrozen: Object.isFrozen(liveP4.params),
    note: "результат двери — boolean; уровень ядра не порождается (legacy-рукав spread-ит транзиентную оболочку и её не морозит)",
  });
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
