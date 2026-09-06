// МАТРИЦА A — семейство «shared/browser-env·замыкания плагинов»:
//   D1 createPluginBuildUrl·params|search
//   D2 createPluginBuildUrl·opts
//   D3 createReplaceHistoryState·params|search
//   D4 createReplaceHistoryState·options
// Столбцы: (a) копия-vs-оригинал, P1 (одно чтение/ключ + результат от ПЕРВОГО),
// P2 (лгущий Proxy), P3 (унаследованный аксессор + собственный "__proto__"), P4 (заморозка).
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  createPluginBuildUrl,
  createReplaceHistoryState,
} from "../../../../shared/browser-env/plugin-utils";
import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

const out = (tag: string, v: unknown): void =>
  console.log(tag, JSON.stringify(v));

/** Proxy, чей ownKeys НЕ называет ключ, а getOwnPropertyDescriptor/has утверждают, что он собственный. */
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

/** Ставит унаследованный аксессор на Object.prototype СТРОГО в try/finally. */
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

const captureBrowser = (): {
  browser: {
    replaceState: (s: unknown, u: string) => void;
    getHash: () => string;
  };
  last: () => { state: Record<string, unknown>; url: string } | undefined;
} => {
  let last: { state: Record<string, unknown>; url: string } | undefined;

  return {
    browser: {
      replaceState: (s: unknown, u: string) => {
        const st = s as Record<string, unknown>;

        // буфер переиспользуется — снимаем значения сразу
        last = { state: { ...st }, url: u };
      },
      getHash: () => "",
    },
    last: () => last,
  };
};

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
  const buildUrl = createPluginBuildUrl(router, "");
  const cap = captureBrowser();
  const replaceHistoryState = createReplaceHistoryState(
    api,
    cap.browser,
    (p) => p,
    true,
  );

  // ── ШАПКА: позитивные контроли всех четырёх дверей ───────────────────────
  const ctlUrl = buildUrl("u", { id: "7" }, { tab: "x" }, { hash: "sec" });

  replaceHistoryState("u", { id: "9" }, { tab: "y" }, { hash: "frag" });
  out("H", {
    d1d2_url: ctlUrl,
    d3d4_url: cap.last()?.url,
    d3_bufParams: cap.last()?.state.params,
    coreStateUnchanged: router.getState()?.path,
  });

  // ── D1 · (a) копия vs оригинал ────────────────────────────────────────────
  const p = { id: "7" };
  const s = { tab: "x" };
  const urlOrig = buildUrl("u", p, s);
  const urlCopy = buildUrl("u", { ...p }, { ...s });

  p.id = "MUTATED_AFTER";
  const urlAfterMutation = buildUrl("u", p, s);

  out("D1a", {
    urlOrig,
    urlCopy,
    equal: urlOrig === urlCopy,
    urlAfterMutation,
    callerParamsFrozen: Object.isFrozen(p),
    callerSearchFrozen: Object.isFrozen(s),
    coreState: router.getState()?.path,
  });

  // ── D1 · P1 ───────────────────────────────────────────────────────────────
  const c1p = countingBag({ id: "7" });
  const c1s = countingBag({ tab: "x" });
  const u1 = buildUrl("u", c1p.bag, c1s.bag);
  const d1p = driftingBag({ id: "7" }, { id: "SECOND" });
  const d1s = driftingBag({ tab: "x" }, { tab: "SECOND" });
  const u1d = buildUrl("u", d1p.bag, d1s.bag);

  out("D1p1", {
    reads: { params: c1p.reads, search: c1s.reads },
    url: u1,
    driftUrl: u1d,
    driftReads: { params: d1p.reads, search: d1s.reads },
  });

  // ── D1 · P2 (лгущий Proxy на search) ──────────────────────────────────────
  const lyS = lyingProxy({ tab: "x" }, { evil: "boom" });
  const u1l = buildUrl("u", { id: "7" }, lyS.bag as never);
  const lyP = lyingProxy({ id: "7" }, { tab: "SNEAK" });
  let d1ThrowP2: string | undefined;
  let u1lp = "";

  try {
    u1lp = buildUrl("u", lyP.bag as never, undefined);
  } catch (error) {
    d1ThrowP2 = (error as Error).message.slice(0, 80);
  }

  out("D1p2", {
    urlWithLyingSearch: u1l,
    evilInUrl: u1l.includes("evil"),
    gopdAskedForSearch: lyS.gopd,
    urlWithLyingParams: u1lp,
    sneakInUrl: u1lp.includes("SNEAK"),
    gopdAskedForParams: lyP.gopd,
    throwP2: d1ThrowP2,
  });

  // ── D1 · P3 (унаследованный аксессор + собственный "__proto__") ───────────
  const d1p3 = withInheritedAccessor("tab", (log) => {
    const url = buildUrl("u", { id: "7" }, { tab: "own" });

    return { url, protoSetCalls: log.set, protoGetCalls: log.get };
  });
  const poisoned = JSON.parse(
    '{"__proto__":{"polluted":1},"tab":"x"}',
  ) as Record<string, unknown>;
  const u1proto = buildUrl("u", { id: "7" }, poisoned as never);

  out("D1p3", {
    ...d1p3,
    protoUrl: u1proto,
    ownProtoKeyOnBag: Object.hasOwn(poisoned, "__proto__"),
    globalPolluted: ({} as Record<string, unknown>).polluted,
  });

  // ── D1 · P4 ───────────────────────────────────────────────────────────────
  const nested = { deep: { k: 1 } };
  const p4bag = { id: "7", extra: nested } as unknown as Record<string, unknown>;

  buildUrl("u", p4bag as never, { tab: "x" });
  out("D1p4", {
    callerBagFrozen: Object.isFrozen(p4bag),
    callerNestedFrozen: Object.isFrozen(nested),
    note: "результат двери — строка; уровень ядра (транзиентный Canonical) наружу не отдаётся",
  });

  // ── D2 · opts ─────────────────────────────────────────────────────────────
  const o2 = countingBag({ hash: "sec" });
  const u2 = buildUrl("u", { id: "7" }, { tab: "x" }, o2.bag as never);
  const u2copy = buildUrl("u", { id: "7" }, { tab: "x" }, { hash: "sec" });
  const o2d = driftingBag({ hash: "sec" }, { hash: "" });
  const u2d = buildUrl("u", { id: "7" }, { tab: "x" }, o2d.bag as never);
  const o2d2 = driftingBag({ hash: "sec" }, { hash: undefined as never });
  let u2d2 = "";
  let d2throw: string | undefined;

  try {
    u2d2 = buildUrl("u", { id: "7" }, { tab: "x" }, o2d2.bag as never);
  } catch (error) {
    d2throw = `${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 60)}`;
  }

  out("D2", {
    reads: o2.reads,
    url: u2,
    copyEqual: u2 === u2copy,
    driftUrl: u2d,
    driftReads: o2d.reads,
    driftToUndefinedUrl: u2d2,
    driftToUndefinedThrow: d2throw,
    optsFrozen: Object.isFrozen(o2.bag),
  });

  // ── D3 · (a) + P1 ─────────────────────────────────────────────────────────
  const p3o = { id: "3" };
  const s3o = { tab: "z" };

  replaceHistoryState("u", p3o, s3o);
  const bufOrig = cap.last();

  replaceHistoryState("u", { ...p3o }, { ...s3o });
  const bufCopy = cap.last();

  const c3p = countingBag({ id: "4" });
  const c3s = countingBag({ tab: "w" });

  replaceHistoryState("u", c3p.bag, c3s.bag);
  const bufCounted = cap.last();

  out("D3a", {
    urlOrig: bufOrig?.url,
    urlCopy: bufCopy?.url,
    equalUrl: bufOrig?.url === bufCopy?.url,
    paramsOrigIdentity: bufOrig?.state.params === p3o,
    paramsFrozen: Object.isFrozen(bufOrig?.state.params),
    callerFrozen: Object.isFrozen(p3o),
    coreStatePath: router.getState()?.path,
    p1reads: { params: c3p.reads, search: c3s.reads },
    countedUrl: bufCounted?.url,
    countedParams: bufCounted?.state.params,
  });

  // ── D3 · P1 дрейф ─────────────────────────────────────────────────────────
  const d3p = driftingBag({ id: "5" }, { id: "SECOND" });
  const d3s = driftingBag({ tab: "q" }, { tab: "SECOND" });

  replaceHistoryState("u", d3p.bag, d3s.bag);
  out("D3p1", {
    url: cap.last()?.url,
    params: cap.last()?.state.params,
    search: cap.last()?.state.search,
    reads: { params: d3p.reads, search: d3s.reads },
  });

  // ── D3 · P2 (лгущий Proxy: hasOwn в findMisChanneledKey) ─────────────────
  replaceHistoryState("u", { id: "6" }, { tab: "t" });
  const honestOk = cap.last()?.url ?? "";
  let honestMisChannelThrow: string | undefined;

  try {
    replaceHistoryState("u", { id: "6", tab: "t" } as never, undefined);
  } catch (error) {
    honestMisChannelThrow = (error as Error).message.slice(0, 70);
  }

  const ly3 = lyingProxy({ id: "6" }, { tab: "SNEAK" });
  let lyThrow: string | undefined;
  let lyUrl = "";

  try {
    replaceHistoryState("u", ly3.bag as never, undefined);
    lyUrl = cap.last()?.url ?? "";
  } catch (error) {
    lyThrow = (error as Error).message.slice(0, 70);
  }

  const ly3s = lyingProxy({ tab: "t" }, { evil: "boom" });

  replaceHistoryState("u", { id: "6" }, ly3s.bag as never);
  out("D3p2", {
    positiveControlUrl: honestOk,
    honestMisChannelThrow,
    lyingParamsThrow: lyThrow,
    lyingParamsUrl: lyUrl,
    lyingParamsGopd: ly3.gopd,
    lyingSearchUrl: cap.last()?.url,
    evilInSearch: JSON.stringify(cap.last()?.state.search).includes("evil"),
  });

  // ── D3 · P3 ───────────────────────────────────────────────────────────────
  const d3p3 = withInheritedAccessor("id", (log) => {
    replaceHistoryState("u", { id: "own" }, { tab: "t" });

    return {
      url: cap.last()?.url,
      params: cap.last()?.state.params,
      protoSetCalls: log.set,
      protoGetCalls: log.get,
    };
  });
  const poisoned3 = JSON.parse(
    '{"__proto__":{"polluted3":1},"id":"8"}',
  ) as Record<string, unknown>;

  replaceHistoryState("u", poisoned3 as never, { tab: "t" });
  out("D3p3", {
    ...d3p3,
    protoUrl: cap.last()?.url,
    protoParams: cap.last()?.state.params,
    committedProtoOwn: Object.hasOwn(
      cap.last()?.state.params as object,
      "__proto__",
    ),
    globalPolluted3: ({} as Record<string, unknown>).polluted3,
  });

  // ── D3 · P4 ───────────────────────────────────────────────────────────────
  const nested3 = { deep: { k: 1 } };
  const p4b = { id: "9", extra: nested3 } as unknown as Record<string, unknown>;

  replaceHistoryState("u", p4b as never, { tab: "t" });
  out("D3p4", {
    callerBagFrozen: Object.isFrozen(p4b),
    callerNestedFrozen: Object.isFrozen(nested3),
    coreLevelFrozen: Object.isFrozen(cap.last()?.state.params),
    coreLeafFrozen: Object.isFrozen(
      (cap.last()?.state.params as Record<string, unknown>).extra,
    ),
  });

  // ── D4 · options ──────────────────────────────────────────────────────────
  const o4 = countingBag({ hash: "frag" });

  replaceHistoryState("u", { id: "1" }, { tab: "t" }, o4.bag as never);
  const u4 = cap.last()?.url;

  replaceHistoryState("u", { id: "1" }, { tab: "t" }, { hash: "frag" });
  const u4copy = cap.last()?.url;

  const o4d = driftingBag({ hash: "frag" }, { hash: "" });

  replaceHistoryState("u", { id: "1" }, { tab: "t" }, o4d.bag as never);
  const u4d = cap.last()?.url;

  const o4d2 = driftingBag({ hash: "frag" }, { hash: undefined as never });
  let u4d2: string | undefined;
  let d4throw: string | undefined;

  try {
    replaceHistoryState("u", { id: "1" }, { tab: "t" }, o4d2.bag as never);
    u4d2 = cap.last()?.url;
  } catch (error) {
    d4throw = `${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 60)}`;
  }

  out("D4", {
    reads: o4.reads,
    url: u4,
    copyEqual: u4 === u4copy,
    driftUrl: u4d,
    driftReads: o4d.reads,
    driftToUndefinedUrl: u4d2,
    driftToUndefinedThrow: d4throw,
    optsFrozen: Object.isFrozen(o4.bag),
  });
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
