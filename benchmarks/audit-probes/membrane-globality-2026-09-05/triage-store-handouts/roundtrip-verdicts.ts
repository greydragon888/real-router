// Триаж-батч: исполняемое доказательство round-trip / его отсутствия.
import { createRouter } from "@real-router/core";
import {
  getPluginApi,
  getRoutesApi,
  getDependenciesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

async function main(): Promise<void> {

// ---------- A. getRouteConfig·return ----------
{
  const router = createRouter(
    [{ name: "a", path: "/a", preload: 1 }] as never,
    {} as never,
  );
  const api = getPluginApi(router as never);
  const rec = api.getRouteConfig("a") as Record<string, unknown>;
  out["A.recordExists"] = rec !== undefined;
  out["A.notFrozen"] = !Object.isFrozen(rec);
  out["A.sameRefTwice"] = rec === api.getRouteConfig("a");
  rec["injected"] = "by-app";
  getRoutesApi(router as never).update("a", { searchSchema: "s" } as never);
  const after = api.getRouteConfig("a") as Record<string, unknown>;
  out["A.coreCarriedAppWriteForward"] = after["injected"] === "by-app";
  out["A.newRecordIsCopy"] = after !== rec;
  out["A.control_legalFieldsPresent"] =
    after["searchSchema"] === "s" && after["preload"] === 1;
}

// ---------- B. getOptions·return ----------
{
  const appDefaults: Record<string, unknown> = { id: "orig" };
  const router = createRouter([{ name: "d", path: "/d/:id" }] as never, {
    defaultRoute: "d",
    defaultParams: appDefaults,
  } as never);
  const api = getPluginApi(router as never);
  const opts = api.getOptions() as unknown as Record<string, unknown>;
  out["B.shellFrozen"] = Object.isFrozen(opts);
  out["B.nestedIsCallerObject"] = opts["defaultParams"] === appDefaults;
  out["B.nestedNotFrozen"] = !Object.isFrozen(opts["defaultParams"]);
  await router.start("/d/1");
  const before = (await router.navigateToDefault()) as unknown as {
    params: Record<string, unknown>;
  };
  out["B.control_beforeMutation"] = before.params["id"] === "orig";
  (opts["defaultParams"] as Record<string, unknown>)["id"] = "mutated";
  await router.navigate("d", { id: "9" } as never);
  const after = (await router.navigateToDefault()) as unknown as {
    params: Record<string, unknown>;
  };
  out["B.coreReadMutationBack"] = after.params["id"] === "mutated";
}

// ---------- C. routeGetStore / dependenciesGetStore ----------
{
  const router = createRouter([{ name: "s", path: "/s" }] as never, {} as never);
  const ctx = getInternals(router as never) as unknown as {
    routeGetStore: () => Record<string, unknown>;
    dependenciesGetStore: () => Record<string, unknown>;
  };
  const store = ctx.routeGetStore();
  out["C.routeStoreSameRef"] = store === ctx.routeGetStore();
  out["C.routeStoreNotFrozen"] = !Object.isFrozen(store);
  const ds = ctx.dependenciesGetStore();
  out["C.depsStoreSameRef"] = ds === ctx.dependenciesGetStore();
  out["C.depsStoreNotFrozen"] = !Object.isFrozen(ds);
  (ds["dependencies"] as Record<string, unknown>)["viaHandout"] = 42;
  out["C.depsWriteReadBackByCore"] =
    (
      getDependenciesApi(router as never).getAll() as unknown as Record<
        string,
        unknown
      >
    )["viaHandout"] === 42;
  getDependenciesApi(router as never).set("legal", 1 as never);
  out["C.control_legalSetVisible"] =
    (
      getDependenciesApi(router as never).getAll() as unknown as Record<
        string,
        unknown
      >
    )["legal"] === 1;
  // ядро читает свой store обратно: маршрут, добавленный через API, виден в том же объекте
  getRoutesApi(router as never).add([{ name: "s2", path: "/s2" }] as never);
  out["C.routeStoreObservesLaterCrud"] =
    (
      store["matcher"] as unknown as { hasRoute: (n: string) => boolean }
    ).hasRoute("s2") === true;
}

// ---------- D. GuardFn·toState ----------
{
  let seen: object | undefined;
  const router = createRouter(
    [
      { name: "g", path: "/g" },
      {
        name: "h",
        path: "/h",
        canActivate: () => (toState: never) => {
          seen = toState as unknown as object;
          (toState as unknown as Record<string, unknown>)["injectedByGuard"] =
            true;

          return true;
        },
      },
    ] as never,
    {} as never,
  );
  await router.start("/g");
  const committed = (await router.navigate("h")) as unknown as object;
  out["D.control_guardRan"] = seen !== undefined;
  out["D.guardSawSameObjectAsCommitted"] = seen === committed;
  out["D.guardWriteSurvivedCommit"] =
    (committed as Record<string, unknown>)["injectedByGuard"] === true;
  out["D.committedIsRouterState"] =
    committed === (router.getState() as unknown as object);
  out["D.committedFrozen"] = Object.isFrozen(committed);
}

// ---------- E. matchPath encoder ----------
{
  let codecSaw: object | undefined;
  const router = createRouter(
    [
      {
        name: "e",
        path: "/e/:id",
        encodeParams: (ch: never) => {
          codecSaw = (ch as unknown as { params: object }).params;
          (codecSaw as Record<string, unknown>)["injectedByCodec"] = "yes";

          return ch;
        },
      },
    ] as never,
    {} as never,
  );
  const ctx = getInternals(router as never) as unknown as {
    matchPath: (
      p: string,
      o: unknown,
    ) => { params: Record<string, unknown> } | undefined;
    getOptions: () => Record<string, unknown>;
  };
  const st = ctx.matchPath("/e/9", {
    ...ctx.getOptions(),
    rewritePathOnMatch: true,
  });
  out["E.control_realParamDecoded"] = st?.params["id"] === "9";
  out["E.codecRan"] = codecSaw !== undefined;
  out["E.codecObjectIsStateParams"] =
    codecSaw === (st?.params as unknown as object);
  out["E.codecWriteReachedPublishedState"] =
    st?.params["injectedByCodec"] === "yes";
}

// ---------- F. RoutesApi.get·return ----------
{
  const dp: Record<string, unknown> = { id: "1" };
  const router = createRouter(
    [{ name: "f", path: "/f/:id", defaultParams: dp }] as never,
    {} as never,
  );
  const rapi = getRoutesApi(router as never);
  const r1 = rapi.get("f") as unknown as Record<string, unknown>;
  const r2 = rapi.get("f") as unknown as Record<string, unknown>;
  out["F.control_getReturnedRoute"] = r2["name"] === "f";
  out["F.freshShellPerCall"] = r1 !== r2;
  out["F.shellNotFrozen"] = !Object.isFrozen(r1);
  out["F.interiorByReference"] = r1["defaultParams"] === dp;
  r1["path"] = "/HACKED";
  out["F.shellWriteInvisibleToCore"] =
    (rapi.get("f") as unknown as Record<string, unknown>)["path"] === "/f/:id";
  out["F.shellWriteInvisibleToBuildPath"] =
    router.buildPath("f", { id: "3" } as never) === "/f/3";
}

// ---------- G. subscribeChanges·event ----------
{
  const events: Record<string, unknown>[] = [];
  const router = createRouter(
    [{ name: "g0", path: "/g0" }] as never,
    {} as never,
  );
  const rapi = getRoutesApi(router as never);
  const un = rapi.subscribeChanges((e: never) => {
    events.push(e as unknown as Record<string, unknown>);
  });
  const dp: Record<string, unknown> = { id: "1" };
  rapi.add([{ name: "g1", path: "/g1/:id", defaultParams: dp }] as never);
  const ev = events[0];
  out["G.control_eventDelivered"] = ev !== undefined && ev["op"] === "add";
  const added = (ev["added"] as Record<string, unknown>[])[0];
  out["G.addedArrayFrozen"] = Object.isFrozen(ev["added"]);
  out["G.addedRouteFrozen"] = Object.isFrozen(added);
  out["G.interiorByReference"] = added["defaultParams"] === dp;
  un();
}

// ---------- H. systemCommit·fromState | opts ----------
{
  const router = createRouter(
    [
      { name: "h0", path: "/h0" },
      { name: "h1", path: "/h1" },
    ] as never,
    {} as never,
  );
  const ctx = getInternals(router as never) as unknown as {
    systemCommit: (t: unknown, f?: unknown, o?: unknown) => unknown;
    makeState: (n: string, p?: unknown, s?: unknown) => unknown;
  };
  await router.start("/h0");
  const foreignFrom = {
    name: "foreign",
    params: {},
    search: {},
    path: "/foreign",
    context: {},
  } as unknown;
  const foreignOpts: Record<string, unknown> = { replace: true };
  let hookFrom: unknown;
  let hookOpts: unknown;
  const api = getPluginApi(router as never);
  api.addEventListener(
    "$$success" as never,
    ((_t: unknown, f: unknown, o: unknown) => {
      hookFrom = f;
      hookOpts = o;
    }) as never,
  );
  const to = ctx.makeState("h1");
  const committed = ctx.systemCommit(to, foreignFrom, foreignOpts);
  out["H.control_commitHappened"] =
    (router.getState() as unknown as object) === (committed as object);
  out["H.listenerGotCallerFromByReference"] = hookFrom === foreignFrom;
  out["H.listenerGotCallerOptsByReference"] = hookOpts === foreignOpts;
  out["H.optsNotFrozenAtHook"] = !Object.isFrozen(hookOpts);
  out["H.fromStateNotStoredAsPrevious"] =
    (router.getPreviousState() as unknown as object) !==
    (foreignFrom as object);
  out["H.toStateWasCopied"] = (committed as object) !== (to as object);
}

}

void main().then(() => {
  console.log(JSON.stringify(out, null, 1));
});
