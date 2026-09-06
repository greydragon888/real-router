// L3-routes-api · семейство add/replace: что происходит с КОНТЕЙНЕРАМИ на
// границе. Каждый блок несёт позитивный контроль (тот же код, легальный вход)
// и свидетельство, что вход дошёл до проверяемой ветви.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

async function main(): Promise<void> {

const diff = (
  now: Readonly<Record<string, number>>,
  before: Readonly<Record<string, number>>,
): Record<string, number> => {
  const res: Record<string, number> = {};

  for (const key of new Set([...Object.keys(now), ...Object.keys(before)])) {
    res[key] = (now[key] ?? 0) - (before[key] ?? 0);
  }

  return res;
};

// ── (i) МАССИВ вызывающего: сколько раз ядро его обходит ──────────────────
for (const door of ["add", "replace"] as const) {
  const router = createRouter([{ name: "home", path: "/home" }] as never);
  const gets: string[] = [];
  const arr = [{ name: "a", path: "/a" }];
  const proxied = new Proxy(arr, {
    get(target, key, receiver): unknown {
      gets.push(typeof key === "symbol" ? key.toString() : key);

      return Reflect.get(target, key, receiver);
    },
  });

  getRoutesApi(router)[door](proxied as never);

  out[`${door} · array gets (in order)`] = gets;
  out[`${door} · array walks`] = {
    iterator: gets.filter((k) => k === "Symbol(Symbol.iterator)").length,
    map: gets.filter((k) => k === "map").length,
    length: gets.filter((k) => k === "length").length,
  };
  out[`${door} · positive control: route registered`] =
    getRoutesApi(router).has("a");
  router.dispose();
}

// ── (ii) options.parent — единственное чтение ──────────────────────────────
{
  const router = createRouter([{ name: "p", path: "/p" }] as never);
  const opts = countingBag({ parent: "p" });

  getRoutesApi(router).add(
    { name: "kid", path: "/kid" } as never,
    opts.bag as never,
  );

  out["add · options.parent reads"] = { ...opts.reads };
  out["add · positive control: kid under parent"] =
    getRoutesApi(router).has("p.kid");
  router.dispose();
}

// ── (iii)+(iv) вложенные defaultParams/defaultSearch: идентичность и поздние чтения ──
for (const door of ["add", "replace"] as const) {
  const router = createRouter([{ name: "home", path: "/home" }] as never);
  // `tab` объявлен как ?query, а в defaultParams лежит с undefined — единственная
  // форма, при которой канал-гвард (`findMisChanneledKey`) ЧИТАЕТ ключ и пропускает.
  const dp = countingBag({ id: "1", tab: undefined });
  const ds = countingBag({ tab: "x" });
  const events: unknown[] = [];

  getRoutesApi(router).subscribeChanges((e) => events.push(e));

  const batch = [
    { name: "home", path: "/home" },
    {
      name: "u",
      path: "/u/:id?tab",
      defaultParams: dp.bag,
      defaultSearch: ds.bag,
    },
  ];

  if (door === "add") {
    getRoutesApi(router).add(batch[1] as never);
  } else {
    getRoutesApi(router).replace(batch as never);
  }

  out[`${door} · nested reads at registration`] = {
    defaultParams: { ...dp.reads },
    defaultSearch: { ...ds.reads },
  };

  const got = getRoutesApi(router).get("u");

  out[`${door} · get().defaultParams === caller bag`] =
    got?.defaultParams === dp.bag;
  out[`${door} · get().defaultSearch === caller bag`] =
    got?.defaultSearch === ds.bag;

  const ev = events.at(-1) as {
    op: string;
    added: { name: string; defaultParams?: unknown; defaultSearch?: unknown }[];
  };
  const added = ev.added.find((r) => r.name === "u");

  out[`${door} · TREE_CHANGED added[u].defaultParams === caller bag`] =
    added?.defaultParams === dp.bag;
  out[`${door} · TREE_CHANGED payload op`] = ev.op;

  let before = { ...dp.reads };

  getRoutesApi(router).add({ name: "other", path: "/other" } as never);
  out[`${door} → add(other) · extra reads of HELD defaultParams`] = diff(
    dp.reads,
    before,
  );

  before = { ...dp.reads };
  getPluginApi(router).setRootPath("/root");
  out[`${door} → setRootPath · extra reads of HELD defaultParams`] = diff(
    dp.reads,
    before,
  );
  out[`${door} → setRootPath · applied (control)`] =
    getPluginApi(router).getRootPath() === "/root";

  before = { ...dp.reads };
  const beforeDs = { ...ds.reads };

  await router.start("/root/home");
  await router.navigate("u", { id: "7" });
  out[`${door} → navigate · extra reads of HELD defaultParams`] = diff(
    dp.reads,
    before,
  );
  out[`${door} → navigate · extra reads of HELD defaultSearch`] = diff(
    ds.reads,
    beforeDs,
  );
  out[`${door} → navigate · committed (control)`] = router.getState()?.path;
  router.dispose();
}

// ── (v) мутация вложенного мешка ПОСЛЕ регистрации видна ядру (ручка держится) ──
{
  const router = createRouter([{ name: "home", path: "/home" }] as never);
  const bag: Record<string, unknown> = { tab: "x" };

  getRoutesApi(router).add({
    name: "u",
    path: "/u/:id?tab",
    defaultSearch: bag,
  } as never);

  const hrefBefore = router.buildPath("u", { id: "1" });

  bag.tab = "MUTATED";

  out["add · buildPath before/after mutating caller's defaultSearch"] = [
    hrefBefore,
    router.buildPath("u", { id: "1" }),
  ];
  router.dispose();
}

// ── (vi) custom-поле: контейнер маршрута скопирован, ЛИСТ по ссылке ──────────
{
  const router = createRouter([{ name: "home", path: "/home" }] as never);
  const leaf = { schema: 1 };
  const route: Record<string, unknown> = { name: "c", path: "/c", meta: leaf };

  getRoutesApi(router).add(route as never);
  route.late = "added-after";

  const record = getPluginApi(router).getRouteConfig("c");

  out["add · custom leaf identity (getRouteConfig(c).meta === leaf)"] =
    record?.meta === leaf;
  out["add · route container NOT held (late key absent)"] =
    record !== undefined && !("late" in record);
  out["add · getRouteConfig returns the same record twice"] =
    record === getPluginApi(router).getRouteConfig("c");
  out["add · custom record is not the caller's route object"] =
    (record as unknown) !== route;
  router.dispose();
}

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
