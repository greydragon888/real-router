// ОПРОВЕРГАТЕЛЬ семейства «route-custom-fields·putField».
// Ищем потребителя, зависящего от ИДЕНТИЧНОСТИ КОНТЕЙНЕРА вызывающего
// (или от обратной видимости мутаций контейнера после вызова).
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

// ── A: createRouter·routes[] — раздаётся ли КОНТЕЙНЕР вызывающего обратно? ──
function runA(preCopy: boolean): Record<string, unknown> {
  const leaf = { schema: 1 };
  const dp = { id: "1" };
  const route: Record<string, unknown> = {
    name: "u",
    path: "/u/:id?tab",
    zz: leaf,
    defaultParams: dp,
  };
  const passed = preCopy ? { ...route } : route;
  const router = createRouter([passed] as never);
  const api = getRoutesApi(router);

  const got = api.get("u") as Record<string, unknown> | undefined;
  const rec = getPluginApi(router).getRouteConfig("u");
  const res: Record<string, unknown> = {
    "get === caller container": (got as unknown) === (passed as unknown),
    "record === caller container": (rec as unknown) === (passed as unknown),
    "record.zz === caller leaf": rec?.zz === leaf,
    "get.defaultParams === caller leaf": got?.defaultParams === dp,
  };

  (passed as Record<string, unknown>).lateCustom = { late: 1 };
  res["lateContainerKeyVisible"] =
    getPluginApi(router).getRouteConfig("u")?.lateCustom !== undefined;
  res["pathBeforeLeafMut"] = router.buildPath("u", {});
  dp.id = "9";
  res["pathAfterLeafMut"] = router.buildPath("u", {});
  router.dispose();

  return res;
}

out["A original"] = runA(false);
out["A pre-copied"] = runA(true);
out["A equal?"] =
  JSON.stringify(out["A original"]) === JSON.stringify(out["A pre-copied"]);

// ── B: update·updates — раздаётся ли КОНТЕЙНЕР патча в событие? ─────────────
function runB(preCopy: boolean): Record<string, unknown> {
  const enc = (p: Record<string, unknown>): Record<string, unknown> => p;
  const ds = { tab: "x" };
  const leaf = { schema: 2 };
  const updates: Record<string, unknown> = {
    defaultSearch: ds,
    encodeParams: enc,
    zz: leaf,
  };
  const passed = preCopy ? { ...updates } : updates;
  const router = createRouter([{ name: "u", path: "/u/:id?tab" }] as never);
  const api = getRoutesApi(router);
  const events: { patch?: Record<string, unknown> }[] = [];

  api.subscribeChanges((e) => {
    events.push(e as unknown as { patch?: Record<string, unknown> });
  });
  api.update("u", passed as never);

  const ev = events[0];
  const rec = getPluginApi(router).getRouteConfig("u");
  const res: Record<string, unknown> = {
    events: events.length,
    "event.patch === caller container":
      (ev?.patch as unknown) === (passed as unknown),
    // докблок tree-changed.ts · TreeChangedUpdate.patch: encodeParams — СЫРАЯ функция вызывающего
    "event.patch.encodeParams === caller fn": ev?.patch?.encodeParams === enc,
    "event.patch.defaultSearch === caller leaf": ev?.patch?.defaultSearch === ds,
    "record.zz === caller leaf": rec?.zz === leaf,
    "get.defaultSearch === caller leaf":
      (api.get("u") as Record<string, unknown> | undefined)?.defaultSearch ===
      ds,
    path: router.buildPath("u", { id: "7" }),
  };

  (passed as Record<string, unknown>).lateCustom = { late: 1 };
  res["lateContainerKeyVisible"] =
    getPluginApi(router).getRouteConfig("u")?.lateCustom !== undefined;
  ds.tab = "y";
  res["pathAfterLeafMut"] = router.buildPath("u", { id: "7" });
  router.dispose();

  return res;
}

out["B original"] = runB(false);
out["B pre-copied"] = runB(true);
out["B equal?"] =
  JSON.stringify(out["B original"]) === JSON.stringify(out["B pre-copied"]);

// ── C: разрушительная ветка — удаление кастом-поля через null ───────────────
function runC(preCopy: boolean): Record<string, unknown> {
  const router = createRouter([
    { name: "u", path: "/u", zz: { a: 1 }, yy: { b: 2 } },
  ] as never);
  const api = getPluginApi(router);
  const before = Object.keys(api.getRouteConfig("u") ?? {}).sort();
  const patch1: Record<string, unknown> = { zz: null };

  getRoutesApi(router).update("u", (preCopy ? { ...patch1 } : patch1) as never);

  const mid = Object.keys(api.getRouteConfig("u") ?? {}).sort();
  const patch2: Record<string, unknown> = { yy: null };

  getRoutesApi(router).update("u", (preCopy ? { ...patch2 } : patch2) as never);

  const after = api.getRouteConfig("u");
  const res = {
    before,
    "after zz:null": mid,
    "record after emptying":
      after === undefined ? "undefined" : Object.keys(after).sort(),
  };

  router.dispose();

  return res;
}

out["C original"] = runC(false);
out["C pre-copied"] = runC(true);
out["C equal?"] =
  JSON.stringify(out["C original"]) === JSON.stringify(out["C pre-copied"]);

// ── ПОЗИТИВНЫЙ КОНТРОЛЬ ИНСТРУМЕНТА идентичности ───────────────────────────
{
  const o = { name: "u", path: "/u" };
  const same = o;
  const copy = { ...o };

  out["CTRL identity predicate true-case"] = (same as unknown) === (o as unknown);
  out["CTRL identity predicate false-case"] =
    (copy as unknown) === (o as unknown);
}

for (const [k, v] of Object.entries(out)) {
  console.log(`${k}: ${JSON.stringify(v)}`);
}
