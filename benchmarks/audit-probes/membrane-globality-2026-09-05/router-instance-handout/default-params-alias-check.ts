// Проверка механизма известных дверей createRouter·routes[].defaultParams /
// RoutesApi.add·routes[].defaultParams / RoutesApi.update·updates.defaultParams
// и RoutesApi.get·return: держит ли стор ЛИТЕРАЛ вызывающего по ссылке, видна ли
// пост-регистрационная мутация в makeState/buildPath, сколько раз ядро читает
// мешок вызывающего за одну навигацию (countingProxy — accessor-мешки на
// определении маршрута отвергаются guardRouteStructure, #1911).
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // (1) createRouter: идентичность + мутация после регистрации
  const lit = { tab: "x" };
  const routes = [
    { name: "home", path: "/" },
    { name: "u", path: "/u/:id", defaultParams: lit },
  ] as never;
  const router = createRouter(routes, {} as never);
  const api = getPluginApi(router);
  const before = api.makeState("u", { id: "1" }).params;
  lit.tab = "MUTATED";
  (lit as Bag).added = "NEW";
  const after = api.makeState("u", { id: "1" }).params;
  out.s1_createRouter = {
    storeHoldsCallerLiteral: getRoutesApi(router).get("u")!.defaultParams === lit,
    beforeMutation: before,
    afterMutation: after,
    mutationVisibleInMakeState: after.tab === "MUTATED" && after.added === "NEW",
    stateParamsIsCallerLiteral: after === (lit as unknown),
  };

  // (2) RoutesApi.add: та же проверка
  const litAdd = { tab: "a" };
  getRoutesApi(router).add([{ name: "v", path: "/v/:id", defaultParams: litAdd }] as never);
  litAdd.tab = "MUTATED_ADD";
  out.s2_add = {
    storeHoldsCallerLiteral: getRoutesApi(router).get("v")!.defaultParams === litAdd,
    mutationVisible: api.makeState("v", { id: "1" }).params.tab === "MUTATED_ADD",
  };

  // (3) RoutesApi.update: та же проверка
  const litUpd = { tab: "u1" };
  getRoutesApi(router).update("u", { defaultParams: litUpd } as never);
  litUpd.tab = "MUTATED_UPD";
  out.s3_update = {
    storeHoldsCallerLiteral: getRoutesApi(router).get("u")!.defaultParams === litUpd,
    mutationVisible: api.makeState("u", { id: "1" }).params.tab === "MUTATED_UPD",
  };

  // (4) счёт чтений мешка вызывающего за один makeState / navigate / buildPath
  const { bag, reads } = countingProxy({ tab: "p", extra: "e" });
  const r2 = createRouter(
    [
      { name: "home", path: "/" },
      { name: "w", path: "/w/:id", defaultParams: bag },
    ] as never,
    {} as never,
  );
  const readsAfterConstruction = { ...reads };
  getPluginApi(r2).makeState("w", { id: "1" });
  const readsAfterMakeState = { ...reads };
  r2.buildPath("w", { id: "1" });
  const readsAfterBuildPath = { ...reads };
  await r2.start("/");
  await r2.navigate("w", { id: "2" });
  const readsAfterNavigate = { ...reads };
  await r2.navigate("w", { id: "3" });
  const readsAfterSecondNavigate = { ...reads };
  out.s4_readsPerUse = {
    readsAfterConstruction,
    readsAfterMakeState,
    readsAfterBuildPath,
    readsAfterNavigate,
    readsAfterSecondNavigate,
    storeHoldsProxyItself: getRoutesApi(r2).get("w")!.defaultParams === (bag as unknown),
  };

  // (5) positive control: get() shell is fresh, the nested bag is the same handle
  const g1 = getRoutesApi(r2).get("w")!;
  const g2 = getRoutesApi(r2).get("w")!;
  out.s5_getShell = { freshShell: g1 !== g2, sameNestedBag: g1.defaultParams === g2.defaultParams };

  console.log(JSON.stringify(out, null, 1));
}

void main();
