// P1 для port().pathNames·return и matcher.getDeclaredQueryParams·return:
// счёт чтений и ДРЕЙФ на каждом входе.
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
  routeGetStore: () => AnyRec & {
    urlParamsCache: Map<string, string[]>;
    queryParamsCache: Map<string, string[]>;
  };
};
type R = { buildPath: (n: string, p?: AnyRec, s?: AnyRec) => string };
const mk = () => {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "q", path: "/q/:id?tab" },
    ] as never,
    { defaultRoute: "home" } as never,
  );
  const int = getInternals(router) as unknown as Int;
  return { router, int, store: int.routeGetStore() };
};
const frame = (router: unknown): AnyRec => {
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  return {
    build: t(() => (router as R).buildPath("q", { id: "1" }, { tab: "x" })),
    search: t(() => ({
      ...(api.makeState("q", { id: "1" }, { tab: "x" }).search as AnyRec),
    })),
    params: t(() => ({
      ...(api.makeState("q", { id: "1" }, { tab: "x" }).params as AnyRec),
    })),
  };
};

// --- контроль: нетронутый роутер
out.CONTROL = frame(mk().router);

// --- счёт чтений индекса 0 path-реестра ("id") за один кадр
{
  const { router, store } = mk();
  let reads = 0;
  store.urlParamsCache.set(
    "q",
    new Proxy(["id"], {
      get(tg, k, r) {
        if (k === "0") {
          reads++;
        }
        return Reflect.get(tg, k, r);
      },
    }) as unknown as string[],
  );
  reads = 0;
  const b = t(() => (router as R).buildPath("q", { id: "1" }, { tab: "x" }));
  const perBuild = reads;
  reads = 0;
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  const s = t(() => ({
    ...(api.makeState("q", { id: "1" }, { tab: "x" }).search as AnyRec),
  }));
  out.pathNames_reads = {
    perBuildPath: perBuild,
    perMakeState: reads,
    build: b,
    search: s,
  };
}

// --- дрейф path-реестра: "id" на первом чтении, "DRIFT" далее
{
  const { router, store } = mk();
  let n = 0;
  store.urlParamsCache.set(
    "q",
    new Proxy(["id"], {
      get(tg, k, r) {
        if (k === "0") {
          return n++ === 0 ? "id" : "DRIFT";
        }
        return Reflect.get(tg, k, r);
      },
    }) as unknown as string[],
  );
  out.pathNames_drift = frame(router);
}

// --- дрейф матчерного declaredQueryParams (источник обоих кэшей)
{
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "q", path: "/q/:id?tab" },
    ] as never,
    { defaultRoute: "home" } as never,
  );
  const int = getInternals(router) as unknown as Int & {
    routeGetStore: () => AnyRec & {
      matcher: { getDeclaredQueryParams: (n: string) => string[] | undefined };
    };
  };
  const store = int.routeGetStore();
  const declared = store.matcher.getDeclaredQueryParams("q")!;
  let n = 0;
  Object.defineProperty(declared, 0, {
    configurable: true,
    enumerable: true,
    get: () => (n++ === 0 ? "tab" : "DRIFT"),
  });
  out.matcherDeclared_drift = {
    frame: frame(router),
    readsSoFar: n,
    registry: [...int.getQueryParams("q")],
  };
}

console.log(JSON.stringify(out, null, 1));
