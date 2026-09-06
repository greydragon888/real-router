// P1/P2/P3 семейства на ЛГУЩЕМ и ДРЕЙФУЮЩЕМ входе.
// Инструмент: считающий/лгущий Proxy подставляется в store.queryParamsCache —
// ядро с этого момента получает ИМЕННО его через getQueryParams / port().queryNames.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};
const t = (fn: () => unknown): unknown => {
  try {
    return fn();
  } catch (e) {
    return `throw:${(e as Error).name}:${(e as Error).message.slice(0, 80)}`;
  }
};

type Int = {
  getQueryParams: (n: string) => readonly string[];
  port: () => { queryNames: (n: string) => readonly string[] };
  routeGetStore: () => AnyRec & {
    matcher: { getDeclaredQueryParams: (n: string) => readonly string[] | undefined };
    urlParamsCache: Map<string, string[]>;
    queryParamsCache: Map<string, string[]>;
  };
};
type R = { buildPath: (n: string, p?: AnyRec, s?: AnyRec) => string };

const mk = (mode = "default") => {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "q", path: "/q/:id?tab" },
    ] as never,
    { defaultRoute: "home", queryParamsMode: mode } as never,
  );
  const int = getInternals(router) as unknown as Int;
  return { router, int, store: int.routeGetStore() };
};

const frame = (router: unknown, label: string): AnyRec => {
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  return {
    [label + "_build"]: t(() =>
      (router as R).buildPath("q", { id: "1" }, { tab: "x" }),
    ),
    [label + "_makeState"]: t(() => ({
      ...(api.makeState("q", { id: "1" }, { tab: "x" }).search as AnyRec),
    })),
  };
};

// ------------------------------------------------------------------ P1
// Считающий Proxy: сколько ЧТЕНИЙ ключа "tab" (индекс 0) в одном кадре.
{
  const { router, store } = mk();
  const real = ["tab"];
  let reads = 0;
  const counting = new Proxy(real, {
    get(tgt, k, rec) {
      if (k === "0") {
        reads++;
      }
      return Reflect.get(tgt, k, rec);
    },
    has(tgt, k) {
      if (k === "0") {
        reads++;
      }
      return Reflect.has(tgt, k);
    },
  });
  store.queryParamsCache.set("q", counting as unknown as string[]);
  reads = 0;
  const b = frame(router, "build");
  const perBuild = reads;
  reads = 0;
  const m = frame(router, "state");
  const perState = reads;

  // ДРЕЙФ: тот же ключ отдаёт "tab" на 1-м чтении и "DRIFT" далее.
  const { router: r2, store: s2 } = mk();
  let n = 0;
  const drifting = new Proxy(["tab"], {
    get(tgt, k, rec) {
      if (k === "0") {
        return n++ === 0 ? "tab" : "DRIFT";
      }
      return Reflect.get(tgt, k, rec);
    },
  });
  s2.queryParamsCache.set("q", drifting as unknown as string[]);
  const driftFrame = frame(r2, "drift");
  // позитивный контроль: СТАБИЛЬНЫЙ Proxy даёт baseline
  const { router: r3, store: s3 } = mk();
  s3.queryParamsCache.set(
    "q",
    new Proxy(["tab"], {}) as unknown as string[],
  );
  const ctlFrame = frame(r3, "ctl");

  out.P1 = {
    positiveControl_proxyIsConsulted: perBuild + perState > 0,
    reads_perBuildPath: perBuild,
    reads_perMakeState: perState,
    build_result: b,
    state_result: m,
    drift_result: driftFrame,
    control_stableProxy: ctlFrame,
    driftChangedVerdict:
      JSON.stringify(driftFrame.drift_makeState) !==
      JSON.stringify(ctlFrame.ctl_makeState),
  };
}

// ------------------------------------------------------------------ P2
// Лгущий Proxy: ownKeys не называет "0", getOwnPropertyDescriptor утверждает,
// что он собственный. Попадёт ли ключ в состояние?
{
  const { router, store } = mk();
  const real = ["tab"];
  const liar = new Proxy(real, {
    ownKeys: () => ["length"],
    getOwnPropertyDescriptor: (tgt, k) =>
      k === "0"
        ? { value: "tab", writable: true, enumerable: true, configurable: true }
        : Reflect.getOwnPropertyDescriptor(tgt, k),
  });
  store.queryParamsCache.set("q", liar as unknown as string[]);
  const lied = frame(router, "lie");
  const { router: rc } = mk();
  const ctl = frame(rc, "ctl");
  out.P2 = {
    control: ctl,
    lyingOwnKeys: lied,
    // ownKeys скрыл ключ, а ядро всё равно его увидело ⇒ перечисление НЕ по ownKeys
    keySurvivedDespiteHiddenOwnKeys:
      JSON.stringify(lied.lie_makeState) === JSON.stringify(ctl.ctl_makeState),
  };
}

// ------------------------------------------------------------------ P3
// Унаследованный аксессор под именем ключа-индекса: ядро наполняет свои
// массивы через `push` ([[Set]]) — уйдёт ли запись в аксессор?
{
  // (1) заполнение КЭША (collectUrlParamsArray) под аксессором, глотающим запись
  const { int, store } = mk();
  const cold = !store.urlParamsCache.has("q");
  let hits = 0;
  let res: unknown;
  let derived: unknown;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() {
      hits++;
    },
    get() {
      return undefined;
    },
  });
  try {
    res = [...((int.port() as unknown as { pathNames: (n: string) => string[] }).pathNames?.("q") ?? [])];
  } catch (e) {
    res = `throw:${(e as Error).name}`;
  }
  try {
    derived = [...int.getQueryParams("q")];
  } catch (e) {
    derived = `throw:${(e as Error).name}`;
  } finally {
    delete (Array.prototype as unknown as AnyRec)[0];
  }

  // (2) РЕГИСТРАЦИЯ под тем же аксессором (collectDeclaredQueryParams)
  let hits2 = 0;
  let regResult: unknown;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() {
      hits2++;
    },
    get() {
      return undefined;
    },
  });
  try {
    const r2 = createRouter(
      [{ name: "q", path: "/q/:id?tab" }] as never,
      {} as never,
    );
    const i2 = getInternals(r2) as unknown as Int;
    regResult = {
      declared: [...(i2.routeGetStore().matcher.getDeclaredQueryParams("q") ?? [])],
      registry: [...i2.getQueryParams("q")],
      build: t(() => (r2 as unknown as R).buildPath("q", { id: "1" }, { tab: "x" })),
    };
  } catch (e) {
    regResult = `throw:${(e as Error).name}:${(e as Error).message.slice(0, 80)}`;
  } finally {
    delete (Array.prototype as unknown as AnyRec)[0];
  }

  // позитивный контроль инструмента
  let ctlHits = 0;
  let ownAfterPush = true;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() {
      ctlHits++;
    },
    get() {
      return undefined;
    },
  });
  try {
    const a: string[] = [];
    a.push("x");
    ownAfterPush = Object.getOwnPropertyNames(a).includes("0");
  } finally {
    delete (Array.prototype as unknown as AnyRec)[0];
  }

  out.P3 = {
    positiveControl_setterFires: ctlHits,
    positiveControl_pushLeavesNoOwnIndex: !ownAfterPush,
    cacheWasCold: cold,
    cacheFill_setterHits: hits,
    cacheFill_pathNames: res,
    cacheFill_registry: derived,
    registrationTime_setterHits: hits2,
    registrationTime_result: regResult,
  };
}

console.log(JSON.stringify(out, null, 1));
