// МАТРИЦА семейства «реестры-имён-и-записи-матчера · ручки-на-кэш-ядра».
// Строки — двери: getQueryParams·return, port().queryNames·return,
// port().pathNames·return, matcher.getDeclaredQueryParams·return,
// matcher.match·return, matcher.getSegmentsByName·return.
// Столбцы — H (шапка/позитивные контроли), I (идентичность), A (эксперимент (а)),
// P1..P4.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};
const t = (fn: () => unknown): unknown => {
  try {
    return fn();
  } catch (e) {
    return `throw:${(e as Error).name}:${(e as Error).message.slice(0, 70)}`;
  }
};

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "q", path: "/q/:id?tab" },
  { name: "u", path: "/u/:id", children: [{ name: "c", path: "/c/:cid?q" }] },
] as never;

type Int = {
  getQueryParams: (n: string) => readonly string[];
  port: () => {
    queryNames: (n: string) => readonly string[];
    pathNames: (n: string) => readonly string[] | undefined;
  };
  routeGetStore: () => AnyRec & {
    matcher: {
      getDeclaredQueryParams: (n: string) => readonly string[] | undefined;
      getSegmentsByName: (n: string) => readonly AnyRec[] | undefined;
      match: (p: string) => AnyRec | undefined;
    };
    urlParamsCache: Map<string, string[]>;
    queryParamsCache: Map<string, string[]>;
  };
};

const mk = () => {
  const router = createRouter(ROUTES, { defaultRoute: "home" } as never);
  const int = getInternals(router) as unknown as Int;
  return { router, int, store: int.routeGetStore() };
};

type R = {
  buildPath: (n: string, p?: AnyRec, s?: AnyRec) => string;
  isActiveRoute: (n: string, p?: AnyRec) => boolean;
  matchPath: (p: string) => AnyRec | undefined;
};

// ---------------------------------------------------------------- H. ШАПКА
// Позитивные контроли: каждый наблюдатель РЕАЛЬНО консультируется с реестром.
const battery = (router: unknown, int: Int, label: string): AnyRec => {
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  const rr = router as R;
  const st = t(() => {
    const s = api.makeState("q", { id: "1" }, { tab: "x" });
    return {
      params: { ...(s.params as AnyRec) },
      search: { ...(s.search as AnyRec) },
    };
  });
  return {
    [label + "_registry"]: [...int.getQueryParams("q")],
    [label + "_pathNames"]: [...(int.port().pathNames("q") ?? [])],
    [label + "_buildDeclared"]: t(() =>
      rr.buildPath("q", { id: "1" }, { tab: "x" }),
    ),
    [label + "_buildUndeclaredSearch"]: t(() =>
      rr.buildPath("q", { id: "1" }, { nope: "x" }),
    ),
    [label + "_buildMisChanneled"]: t(() =>
      rr.buildPath("q", { id: "1", tab: "x" }),
    ),
    [label + "_makeState"]: st,
    [label + "_matchPath"]: t(() => {
      const s = rr.matchPath("/q/1?tab=z");
      return (
        s && {
          name: s.name,
          params: { ...(s.params as AnyRec) },
          search: { ...(s.search as AnyRec) },
        }
      );
    }),
    [label + "_isActive"]: t(() => rr.isActiveRoute("q", { id: "1" })),
  };
};
{
  const { router, int } = mk();
  out.H_control = battery(router, int, "ctl");
}

// ------------------------------------------------------------ I. ИДЕНТИЧНОСТЬ
{
  const { int, store } = mk();
  const a = int.getQueryParams("q");
  const b = int.port().queryNames("q");
  const c = int.getQueryParams("q");
  const p1 = int.port().pathNames("q");
  const p2 = int.port().pathNames("q");
  const d1 = store.matcher.getDeclaredQueryParams("q");
  const d2 = store.matcher.getDeclaredQueryParams("q");
  const s1 = store.matcher.getSegmentsByName("u.c");
  const s2 = store.matcher.getSegmentsByName("u.c");
  const m1 = store.matcher.match("/home");
  const m2 = store.matcher.match("/home");
  const mp1 = store.matcher.match("/q/1?tab=z");
  const mp2 = store.matcher.match("/q/1?tab=z");
  out.I_identity = {
    getQueryParams_eq_portQueryNames: a === b,
    getQueryParams_stableAcrossCalls: a === c,
    isTheCachedObject: (a as unknown) === store.queryParamsCache.get("q"),
    pathNames_stable: p1 === p2,
    pathNames_isCachedObject: (p1 as unknown) === store.urlParamsCache.get("q"),
    matcherDeclared_stable: d1 === d2,
    registry_isDerivedNotSame: (a as unknown) !== (d1 as unknown),
    segments_stable: s1 === s2,
    match_static_stable: m1 === m2,
    match_param_freshPerCall: mp1 !== mp2,
    match_segmentsField_eq_getSegmentsByName:
      (mp1 as AnyRec).segments ===
      (store.matcher.getSegmentsByName("q") as unknown),
    frozen_registry: Object.isFrozen(a),
    frozen_pathNames: Object.isFrozen(p1),
    frozen_matcherDeclared: Object.isFrozen(d1),
    frozen_segments: Object.isFrozen(s1),
    frozen_matchStaticShell: Object.isFrozen(m1),
    frozen_matchParamShell: Object.isFrozen(mp1),
    frozen_segmentNode: s1 && Object.isFrozen(s1[0]),
    frozen_segmentNodeChildrenAsObject:
      s1 && Object.isFrozen((s1[0] as AnyRec).children),
  };
}

// -------------------------------------------- A. ЭКСПЕРИМЕНТ (а) НА ОБЕИХ ДВЕРЯХ
// (а) эмулируется ИЗВНЕ src: кэш-Map подменяется на копирующий — ядро больше
// никогда не отдаёт живой массив (ни наружу, ни своим читателям).
class CopyOnGetMap extends Map<string, string[]> {
  override get(k: string): string[] | undefined {
    const v = super.get(k);
    return v === undefined ? undefined : [...v];
  }
}
{
  const { router, int, store } = mk();
  (store as AnyRec).urlParamsCache = new CopyOnGetMap();
  (store as AnyRec).queryParamsCache = new CopyOnGetMap();
  const copied = battery(router, int, "copy");
  const ctl = out.H_control as AnyRec;
  const keys = Object.keys(ctl).map((k) => k.replace(/^ctl_/, ""));
  out.A_copyArm = {
    observationsIdentical: keys.every(
      (k) =>
        JSON.stringify(ctl["ctl_" + k]) === JSON.stringify(copied["copy_" + k]),
    ),
    perKey: Object.fromEntries(
      keys.map((k) => [
        k,
        JSON.stringify(ctl["ctl_" + k]) === JSON.stringify(copied["copy_" + k]),
      ]),
    ),
    copyArm: copied,
    poisonUnderCopy: (() => {
      (int.getQueryParams("q") as string[]).push("nope");
      (int.port().pathNames("q") as string[]).push("tab");
      return battery(router, int, "poisonedUnderCopy");
    })(),
  };
}
// Контрольная рука: ТО ЖЕ отравление на НЕподменённом кэше — стратегия (б)
{
  const { router, int } = mk();
  battery(router, int, "warm");
  (int.getQueryParams("q") as string[]).push("nope");
  out.A_poisonUnderHandle_query = battery(router, int, "poisonQ");
}
{
  const { router, int } = mk();
  battery(router, int, "warm");
  (int.port().pathNames("q") as string[]).push("tab");
  out.A_poisonUnderHandle_path = battery(router, int, "poisonP");
}
// Матчерная дверь: push в declaredQueryParams (upstream реестра)
{
  const { router, int, store } = mk();
  const d = store.matcher.getDeclaredQueryParams("q") as string[];
  const before = [...d];
  const push = t(() => d.push("zzz"));
  out.A_poisonUnderHandle_matcherDeclared = {
    before,
    pushVerdict: push,
    after: [...(store.matcher.getDeclaredQueryParams("q") ?? [])],
    derivedRegistry: [...int.getQueryParams("q")],
    battery: battery(router, int, "poisonD"),
  };
}
// Требует ли КТО-НИБУДЬ ту же ссылку? (кандидат MUST-(б))
{
  const { int } = mk();
  const arr = int.getQueryParams("q");
  const copy = [...arr];
  out.A_identityDemand = {
    includesSame: arr.includes("tab") === copy.includes("tab"),
    lengthSame: arr.length === copy.length,
    weakMapKeyLost: t(() => {
      const wm = new WeakMap<object, string>();
      wm.set(arr as unknown as object, "x");
      return wm.has(copy as unknown as object);
    }),
  };
}

// --------------------------------------------------------------------- P1
{
  const ctlUrl = (() => {
    const { router, int } = mk();
    const arr = int.getQueryParams("q") as string[];
    Object.defineProperty(arr, 0, {
      get: () => "tab",
      configurable: true,
      enumerable: true,
    });
    return t(() => (router as R).buildPath("q", { id: "1" }, { tab: "x" }));
  })();
  const { router, int } = mk();
  const arr = int.getQueryParams("q") as string[];
  let reads = 0;
  Object.defineProperty(arr, 0, {
    get: () => (reads++ === 0 ? "tab" : "DRIFT"),
    configurable: true,
    enumerable: true,
  });
  const url = t(() => (router as R).buildPath("q", { id: "1" }, { tab: "x" }));
  const readsAfterBuild = reads;
  reads = 0;
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  const st = t(() => {
    const s = api.makeState("q", { id: "1" }, { tab: "x" });
    return {
      params: { ...(s.params as AnyRec) },
      search: { ...(s.search as AnyRec) },
    };
  });
  out.P1 = {
    positiveControl_stableGetterSameAsBaseline:
      ctlUrl === (out.H_control as AnyRec).ctl_buildDeclared,
    driftingGetter_buildPathUrl: url,
    reads_perBuildPath: readsAfterBuild,
    reads_perMakeState: reads,
    makeState_underDrift: st,
    baseline_makeState: (out.H_control as AnyRec).ctl_makeState,
  };
}

// --------------------------------------------------------------------- P2
{
  const { router, int } = mk();
  const arr = int.getQueryParams("q") as string[];
  const beforeUrl = t(() =>
    (router as R).buildPath("q", { id: "1" }, { tab: "x" }),
  );
  arr.length = 0;
  const afterUrl = t(() =>
    (router as R).buildPath("q", { id: "1" }, { tab: "x" }),
  );
  const { int: int2, store: store2 } = mk();
  const declared = store2.matcher.getDeclaredQueryParams("q") as string[];
  let speciesCalled = 0;
  class Evil extends Array<string> {
    static override get [Symbol.species](): ArrayConstructor {
      speciesCalled++;
      return Array;
    }
  }
  (declared as unknown as AnyRec).constructor = Evil;
  const derived = int2.getQueryParams("q");
  out.P2 = {
    positiveControl_beforeUrl: beforeUrl,
    lyingLength_afterUrl: afterUrl,
    lyingLength_registryNow: [...int.getQueryParams("q")],
    species_calledDuringFilter: speciesCalled,
    species_derivedRegistry: [...derived],
    species_derivedIsPlainArray: derived.constructor === Array,
  };
}

// --------------------------------------------------------------------- P3
{
  const { int, store } = mk();
  const coldBefore = store.urlParamsCache.has("q");
  let setterHits = 0;
  let captured: unknown;
  let result: unknown;
  let derived: unknown;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set(v: unknown) {
      setterHits++;
      captured = v;
    },
    get() {
      return captured;
    },
  });
  try {
    result = [...(int.port().pathNames("q") ?? [])];
    derived = [...int.getQueryParams("q")];
  } catch (e) {
    result = `throw:${(e as Error).name}`;
  } finally {
    delete (Array.prototype as unknown as AnyRec)[0];
  }
  let ctlHits = 0;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() {
      ctlHits++;
    },
    get() {
      return undefined;
    },
  });
  let ctlLen = -1;
  try {
    const a: string[] = [];
    a.push("x");
    ctlLen = Object.getOwnPropertyNames(a).includes("0") ? 1 : 0;
  } finally {
    delete (Array.prototype as unknown as AnyRec)[0];
  }
  out.P3 = {
    cacheWasCold: !coldBefore,
    positiveControl_setterFiresOnPlainPush: ctlHits,
    positiveControl_ownIndexAfterPush: ctlLen,
    setterHits_duringCacheFill: setterHits,
    pathNames_underInheritedAccessor: result,
    registry_underInheritedAccessor: derived,
    baseline_pathNames: (out.H_control as AnyRec).ctl_pathNames,
    baseline_registry: (out.H_control as AnyRec).ctl_registry,
  };
}

// --------------------------------------------------------------------- P4
{
  const { int, store } = mk();
  const seg = store.matcher.getSegmentsByName("u.c");
  const m = store.matcher.match("/home");
  out.P4 = {
    coreBorn_registry_frozen: Object.isFrozen(int.getQueryParams("q")),
    coreBorn_pathNames_frozen: Object.isFrozen(int.port().pathNames("q")),
    coreBorn_matcherDeclared_frozen: Object.isFrozen(
      store.matcher.getDeclaredQueryParams("q"),
    ),
    coreBorn_matcherDeclared_emptyCase_frozen: Object.isFrozen(
      store.matcher.getDeclaredQueryParams("home"),
    ),
    coreBorn_segments_frozen: Object.isFrozen(seg),
    coreBorn_matchStaticShell_frozen: Object.isFrozen(m),
    coreBorn_matchParamShell_frozen: Object.isFrozen(
      store.matcher.match("/q/1"),
    ),
    deeper_segmentNode_frozen: seg && Object.isFrozen(seg[0]),
    deeper_segmentNodeChildrenMap_writable: t(() => {
      const n = seg?.[0] as unknown as { children: Map<string, unknown> };
      const size = n.children.size;
      n.children.set("__p4__", {});
      const grew = n.children.size === size + 1;
      n.children.delete("__p4__");
      return grew;
    }),
    callersBagFrozen: (() => {
      const { router } = mk();
      const bag = { id: "1" };
      const s = { tab: "x" };
      (router as R).buildPath("q", bag, s);
      return { params: Object.isFrozen(bag), search: Object.isFrozen(s) };
    })(),
  };
}

console.log(JSON.stringify(out, null, 1));
