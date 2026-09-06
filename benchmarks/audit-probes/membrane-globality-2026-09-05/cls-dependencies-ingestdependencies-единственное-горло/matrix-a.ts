// Классификация семейства «dependencies·ingestDependencies (единственное горло)».
// ЧАСТЬ A — эксперимент (а): оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО
// контейнера (мелкая копия, листья — те же ссылки) на всех шести дверях,
// плюс обратная видимость мутаций в обе стороны.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { createRequestScope } from "@real-router/ssr-utils";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as never;

const SVC_A = { mark: "A" };
const SVC_B = { mark: "B" };

const store = (r: unknown): Record<string, unknown> =>
  getInternals(r as never).dependenciesGetStore().dependencies as Record<
    string,
    unknown
  >;

const out: Record<string, unknown> = {};

function observables(r: unknown): Record<string, unknown> {
  const api = getDependenciesApi(r as never);
  const all = api.getAll() as Record<string, unknown>;
  const cs = getInternals(r as never).getCloneState() as {
    dependencies: Record<string, unknown>;
  };
  return {
    getAll_keys: Object.keys(all).sort(),
    getAll_leafIsSVC_A: all["svc"] === SVC_A,
    getAll_isFreshContainer: all !== store(r),
    getAll_proto: Object.getPrototypeOf(all) === null ? "null" : "Object",
    get_leafIsSVC_A: api.get("svc" as never) === SVC_A,
    has_svc: api.has("svc" as never),
    cloneState_deps_keys: Object.keys(cs.dependencies).sort(),
    cloneState_leafIsSVC_A: cs.dependencies["svc"] === SVC_A,
    store_proto: Object.getPrototypeOf(store(r)) === null ? "null" : "Object",
    state: (r as { getState: () => unknown }).getState(),
  };
}

// --- дверь 1: createRouter·dependencies -------------------------------------
{
  const bagOrig: Record<string, unknown> = { svc: SVC_A, n: 1 };
  const bagCopy = { ...bagOrig };
  const rOrig = createRouter(routes, {}, bagOrig as never);
  const rCopy = createRouter(routes, {}, bagCopy as never);
  const oOrig = observables(rOrig);
  const oCopy = observables(rCopy);

  bagOrig["svc"] = SVC_B; // мутируем ОРИГИНАЛ после вызова
  const coreSeesSourceMutation =
    getDependenciesApi(rOrig as never).get("svc" as never) === SVC_B;

  const handed = getDependenciesApi(rOrig as never).getAll() as Record<
    string,
    unknown
  >;
  handed["svc"] = SVC_B; // мутируем то, что ядро ОТДАЛО
  const coreSeesHandoutMutation =
    getDependenciesApi(rOrig as never).get("svc" as never) === SVC_B;

  out["A1·createRouter·dependencies"] = {
    identicalObservables: JSON.stringify(oOrig) === JSON.stringify(oCopy),
    withOriginal: oOrig,
    withPreCopiedContainer: oCopy,
    coreSeesSourceMutation,
    coreSeesHandoutMutation,
  };
}

// --- дверь 2: cloneRouter·dependencies --------------------------------------
{
  const base = createRouter(routes, {}, { baseSvc: SVC_A } as never);
  const ovr: Record<string, unknown> = { svc: SVC_A };
  const c1 = cloneRouter(base as never, ovr as never);
  const c2 = cloneRouter(base as never, { ...ovr } as never);
  const api1 = getDependenciesApi(c1 as never);
  const api2 = getDependenciesApi(c2 as never);
  ovr["svc"] = SVC_B;
  out["A2·cloneRouter·dependencies"] = {
    keysEqual:
      JSON.stringify(Object.keys(api1.getAll()).sort()) ===
      JSON.stringify(Object.keys(api2.getAll()).sort()),
    keys: Object.keys(api1.getAll()).sort(),
    leafIdentity_original: api1.get("svc" as never) === SVC_A,
    leafIdentity_copy: api2.get("svc" as never) === SVC_A,
    inheritedBaseLeafShared: api1.get("baseSvc" as never) === SVC_A,
    baseUntouchedByClone: getDependenciesApi(base as never).has("svc" as never),
    coreSeesSourceMutation: api1.get("svc" as never) === SVC_B,
    cloneStoreIsCallerBag: (store(c1) as unknown) === (ovr as unknown),
  };
}

// --- дверь 3: DependenciesApi.setAll·deps -----------------------------------
{
  const r = createRouter(routes, {}, {} as never);
  const api = getDependenciesApi(r as never);
  const bag: Record<string, unknown> = { svc: SVC_A, k: 2 };
  api.setAll(bag as never);
  const r2 = createRouter(routes, {}, {} as never);
  const api2 = getDependenciesApi(r2 as never);
  api2.setAll({ ...bag } as never);
  bag["svc"] = SVC_B;
  out["A3·setAll·deps"] = {
    keysEqual:
      JSON.stringify(Object.keys(api.getAll()).sort()) ===
      JSON.stringify(Object.keys(api2.getAll()).sort()),
    keys: Object.keys(api.getAll()).sort(),
    leafIdentity_original: api.get("svc" as never) === SVC_A,
    leafIdentity_copy: api2.get("svc" as never) === SVC_A,
    coreSeesSourceMutation: api.get("svc" as never) === SVC_B,
    storeIsCallerBag: (store(r) as unknown) === (bag as unknown),
  };
}

// --- дверь 4: DependenciesApi.set·value (контейнера нет, аргумент = ЛИСТ) ----
{
  const r = createRouter(routes, {}, {} as never);
  const api = getDependenciesApi(r as never);
  const leaf = { mark: "LEAF", n: 0 };
  api.set("svc" as never, leaf as never);
  const gotSame = api.get("svc" as never) === leaf;
  const gotSameViaGetAll =
    (api.getAll() as Record<string, unknown>)["svc"] === leaf;
  const copied = { ...leaf };
  leaf.n = 42;
  out["A4·set·value"] = {
    leafIdentityViaGet: gotSame,
    leafIdentityViaGetAll: gotSameViaGetAll,
    mutationOfLeafVisibleThroughCore:
      (api.get("svc" as never) as { n: number }).n === 42,
    copyingTheArgumentWouldBreakIdentity: copied !== leaf,
    copiedWouldNotSeeMutation: copied.n !== 42,
    valueFrozen: Object.isFrozen(api.get("svc" as never)),
  };
}

// --- дверь 5: createRequestScope·deps ---------------------------------------
{
  const base = createRouter(routes, {}, { baseSvc: SVC_A } as never);
  const req = { signal: new AbortController().signal };
  const deps: Record<string, unknown> = { svc: SVC_A, traceId: "t1" };
  const s1 = createRequestScope(req as never, base as never, deps as never);
  const s2 = createRequestScope(
    req as never,
    base as never,
    { ...deps } as never,
  );
  const a1 = getDependenciesApi(s1.router as never);
  const a2 = getDependenciesApi(s2.router as never);
  deps["svc"] = SVC_B;
  out["A5·createRequestScope·deps"] = {
    keysEqual:
      JSON.stringify(Object.keys(a1.getAll()).sort()) ===
      JSON.stringify(Object.keys(a2.getAll()).sort()),
    keys: Object.keys(a1.getAll()).sort(),
    leafIdentity_original: a1.get("svc" as never) === SVC_A,
    leafIdentity_copy: a2.get("svc" as never) === SVC_A,
    abortSignalLeafIdentity: a1.get("abortSignal" as never) === req.signal,
    coreSeesSourceMutation: a1.get("svc" as never) === SVC_B,
  };
}

// --- дверь 6: RequestDepsFactory·return (форма providersFactory·useFactory) --
{
  const base = createRouter(routes, {}, { baseSvc: SVC_A } as never);
  const factory = (): unknown => ({ svc: SVC_A, currentUser: "u" });
  const returned = factory() as Record<string, unknown>;
  const rOrig = cloneRouter(base as never, returned as never);
  const rCopy = cloneRouter(base as never, { ...returned } as never);
  const aO = getDependenciesApi(rOrig as never);
  const aC = getDependenciesApi(rCopy as never);
  returned["svc"] = SVC_B;
  const undefinedReturn = cloneRouter(base as never, undefined);
  out["A6·RequestDepsFactory·return"] = {
    keysEqual:
      JSON.stringify(Object.keys(aO.getAll()).sort()) ===
      JSON.stringify(Object.keys(aC.getAll()).sort()),
    keys: Object.keys(aO.getAll()).sort(),
    leafIdentity_original: aO.get("svc" as never) === SVC_A,
    leafIdentity_copy: aC.get("svc" as never) === SVC_A,
    coreSeesSourceMutation: aO.get("svc" as never) === SVC_B,
    undefinedReturnClonesBaseDeps:
      getDependenciesApi(undefinedReturn as never).get("baseSvc" as never) ===
      SVC_A,
  };
}

console.log(JSON.stringify(out, null, 1));
