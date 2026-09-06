// Триаж батча «params/search + DependenciesApi.set·value».
// Считаем ЧТЕНИЯ ключа мешка вызывающего на каждой двери (countingBag),
// проверяем идентичность контейнера в опубликованном состоянии и лист по ссылке.
// Позитивные контроли: (1) легальный простой мешок тем же кодом даёт ожидаемый
// результат (href / true / State), (2) счётчик > 0 — доказательство, что вход
// ДОШЁЛ до проверяемой ветки.
import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

async function main(): Promise<void> {

const routes = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
  { name: "src", path: "/src/:id", forwardTo: "dst" },
  { name: "dst", path: "/dst/:id" },
] as never;

const mk = () => createRouter(routes, {} as never);

// ---------- buildPath ----------
{
  const r = mk();
  const p = countingBag({ id: "7" });
  const s = countingBag({ tab: "x" });
  const href = r.buildPath("u", p.bag as never, s.bag as never);
  out["buildPath·params/search"] = {
    href,
    paramReads: p.reads,
    searchReads: s.reads,
  };
}

// ---------- isActiveRoute, НЕ форвардящий маршрут ----------
{
  const r = mk();
  r.start("/u/7?tab=x");
  const p = countingBag({ id: "7" });
  const s = countingBag({ tab: "x" });
  const active = r.isActiveRoute(
    "u",
    p.bag as never,
    s.bag as never,
    false,
    false,
  );
  out["isActiveRoute·nonForwarding"] = {
    active,
    paramReads: p.reads,
    searchReads: s.reads,
  };
}

// ---------- isActiveRoute, ФОРВАРДЯЩИЙ маршрут (второй проход) ----------
{
  const r = mk();
  r.start("/dst/7");
  const p = countingBag({ id: "7" });
  const s = countingBag({ q: "1" });
  const active = r.isActiveRoute(
    "src",
    p.bag as never,
    s.bag as never,
    false,
    true,
  );
  out["isActiveRoute·forwarding"] = {
    active,
    paramReads: p.reads,
    searchReads: s.reads,
  };
}

// ---------- canNavigateTo ----------
{
  const r = mk();
  r.start("/plain/1");
  const p = countingBag({ id: "7" });
  const s = countingBag({ tab: "x" });
  const can = r.canNavigateTo("u", p.bag as never, s.bag as never);
  out["canNavigateTo·params/search"] = {
    can,
    paramReads: p.reads,
    searchReads: s.reads,
  };
}

// ---------- navigate ----------
{
  const r = mk();
  r.start("/plain/1");
  const p = countingBag({ id: "7" });
  const s = countingBag({ tab: "x" });
  const st = await r.navigate("u", p.bag as never, s.bag as never);
  out["navigate·routeParams/routeSearch"] = {
    ok: st.name,
    paramReads: p.reads,
    searchReads: s.reads,
    containerIdentity: (st.params as unknown) === (p.bag as unknown),
    searchIdentity: (st.search as unknown) === (s.bag as unknown),
  };
}

// ---------- navigate: лист по ссылке (контейнер скопирован, лист нет) ----------
{
  const r = mk();
  r.start("/plain/1");
  const leaf = { deep: 1 };
  const st = await r.navigate("u", { id: leaf } as never, {
    tab: ["a"],
  } as never);
  out["navigate·leafByReference"] = {
    leafIdentity: (st.params as Record<string, unknown>).id === leaf,
    paramsFrozen: Object.isFrozen(st.params),
    leafFrozen: Object.isFrozen(leaf),
  };
}

// ---------- PluginApi.makeState / buildNavigationState ----------
{
  const r = mk();
  const api = getPluginApi(r);
  const p1 = countingBag({ id: "7" });
  const s1 = countingBag({ tab: "x" });
  const st = api.makeState("u", p1.bag as never, s1.bag as never, "/u/7?tab=x");
  const p2 = countingBag({ id: "8" });
  const s2 = countingBag({ tab: "y" });
  const st2 = api.buildNavigationState("u", p2.bag as never, s2.bag as never);
  out["PluginApi.makeState·params/search"] = {
    name: st.name,
    paramReads: p1.reads,
    searchReads: s1.reads,
    containerIdentity: (st.params as unknown) === (p1.bag as unknown),
  };
  out["PluginApi.buildNavigationState·params/search"] = {
    path: st2?.path,
    paramReads: p2.reads,
    searchReads: s2.reads,
  };
}

// ---------- DependenciesApi.set·value ----------
{
  const r = mk();
  const deps = getDependenciesApi(r);
  const svc: Record<string, unknown> = { call: () => 1, nested: {} };
  deps.set("svc" as never, svc as never);
  const back = deps.get("svc" as never);
  const all = deps.getAll();
  svc.late = 1;
  out["DependenciesApi.set·value"] = {
    leafIdentityViaGet: (back as unknown) === svc,
    leafIdentityViaGetAll: (all as Record<string, unknown>).svc === svc,
    valueFrozen: Object.isFrozen(svc),
    mutationVisibleAfterSet: "late" in (deps.get("svc" as never) as object),
  };
}

  console.log(JSON.stringify(out, null, 1));
}

void main();
