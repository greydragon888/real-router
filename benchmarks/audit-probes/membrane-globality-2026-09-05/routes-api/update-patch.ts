// L3-routes-api · семейство update: патч-контейнер, custom-поля (#1788 семя),
// ручка на defaultParams/defaultSearch, round-trip хэндаута getRouteConfig,
// и число читателей патча с validation-plugin и без.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

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

// ── (i) патч-контейнер не держится; custom-лист — по ссылке ────────────────
{
  const router = createRouter([{ name: "u", path: "/u/:id?tab" }] as never);
  const patch: Record<string, unknown> = { zz: { a: 1 } };

  getRoutesApi(router).update("u", patch as never);
  patch.later = 2;

  const record = getPluginApi(router).getRouteConfig("u");

  out["update · patch container held? (late key visible)"] =
    record !== undefined && "later" in record;
  out["update · custom leaf identity (record.zz === patch.zz)"] =
    record?.zz === patch.zz;
  out["update · record is not the patch object"] =
    (record as unknown) !== patch;
  router.dispose();
}

// ── (ii) #1788: custom-ключ "__proto__" из JSON.parse ложится как own key ──
{
  const router = createRouter([{ name: "u", path: "/u" }] as never);
  const patch = JSON.parse('{"__proto__": {"x": 1}, "keep": 1}') as Record<
    string,
    unknown
  >;

  out["update · patch has own __proto__ (fixture control)"] = Object.hasOwn(
    patch,
    "__proto__",
  );
  getRoutesApi(router).update("u", patch as never);

  const record = getPluginApi(router).getRouteConfig("u");

  out["update · __proto__ survives as OWN key (#1788)"] =
    record === undefined ? "no record" : Object.hasOwn(record, "__proto__");
  out["update · record prototype intact"] =
    record === undefined
      ? "no record"
      : Object.getPrototypeOf(record) === Object.prototype;
  out["update · own keys of record"] =
    record === undefined ? "no record" : Object.keys(record);
  router.dispose();
}

// ── (iii) defaultParams через update: ручка держится, поздние чтения ───────
{
  const router = createRouter([
    { name: "u", path: "/u/:id?tab" },
    { name: "home", path: "/home" },
  ] as never);
  const dp = countingBag({ id: "1", tab: undefined });
  const ds = countingBag({ tab: "x" });

  getRoutesApi(router).update("u", {
    defaultParams: dp.bag,
    defaultSearch: ds.bag,
  } as never);

  out["update · nested reads at commit"] = {
    defaultParams: { ...dp.reads },
    defaultSearch: { ...ds.reads },
  };
  out["update · get().defaultParams === caller bag"] =
    getRoutesApi(router).get("u")?.defaultParams === dp.bag;
  out["update · get().defaultSearch === caller bag"] =
    getRoutesApi(router).get("u")?.defaultSearch === ds.bag;

  let before = { ...dp.reads };

  getRoutesApi(router).add({ name: "other", path: "/other" } as never);
  out["update → add(other) · extra reads of HELD defaultParams"] = diff(
    dp.reads,
    before,
  );

  before = { ...dp.reads };
  const beforeDs = { ...ds.reads };

  await router.start("/home");
  await router.navigate("u", { id: "7" });
  out["update → navigate · extra reads of HELD defaultParams"] = diff(
    dp.reads,
    before,
  );
  out["update → navigate · extra reads of HELD defaultSearch"] = diff(
    ds.reads,
    beforeDs,
  );
  out["update → navigate · committed (control)"] = router.getState()?.path;
  router.dispose();
}

// ── (iv) мутация мешка после update видна (ручка) ─────────────────────────
{
  const router = createRouter([{ name: "u", path: "/u/:id?tab" }] as never);
  const bag: Record<string, unknown> = { tab: "x" };

  getRoutesApi(router).update("u", { defaultSearch: bag } as never);

  const hrefBefore = router.buildPath("u", { id: "1" });

  bag.tab = "MUTATED";
  out["update · buildPath before/after mutating caller's defaultSearch"] = [
    hrefBefore,
    router.buildPath("u", { id: "1" }),
  ];
  router.dispose();
}

// ── (v) getRouteConfig — хэндаут, который ядро ЧИТАЕТ ОБРАТНО ──────────────
{
  const router = createRouter([{ name: "u", path: "/u", meta: 1 }] as never);
  const record = getPluginApi(router).getRouteConfig("u") as Record<
    string,
    unknown
  >;

  record.pluginCache = "written-by-plugin";
  getRoutesApi(router).update("u", { other: 2 } as never);

  const record2 = getPluginApi(router).getRouteConfig("u") as Record<
    string,
    unknown
  >;

  out["getRouteConfig · record replaced on update (clone-on-write)"] =
    record2 !== record;
  out["getRouteConfig · plugin-written key carried by core's spread"] =
    record2.pluginCache === "written-by-plugin";

  let reads = 0;

  Object.defineProperty(record2, "lazy", {
    enumerable: true,
    configurable: true,
    get(): string {
      reads += 1;

      return "L";
    },
  });
  getRoutesApi(router).update("u", { other: 3 } as never);
  out["getRouteConfig · accessor a plugin put on the LIVE record: reads by core's next update"] =
    reads;
  out["getRouteConfig · …and it landed as plain data in the new record"] =
    Object.getOwnPropertyDescriptor(
      getPluginApi(router).getRouteConfig("u"),
      "lazy",
    )?.value === "L";
  router.dispose();
}

// ── (vi) сколько ЧИТАТЕЛЕЙ у патча: bare core vs validation-plugin ──────────
{
  const mkPatch = (): ReturnType<typeof countingBag> =>
    countingBag({
      forwardTo: undefined,
      defaultParams: { z: "1" },
      defaultSearch: { tab: "d" },
      custom: { c: 1 },
    });

  const bare = createRouter([{ name: "u", path: "/u/:id?tab" }] as never);
  const p1 = mkPatch();

  getRoutesApi(bare).update("u", p1.bag as never);
  out["update · patch reads (bare core)"] = { ...p1.reads };
  out["update · positive control (bare): defaultSearch landed"] =
    getRoutesApi(bare).get("u")?.defaultSearch === p1.bag.defaultSearch;
  bare.dispose();

  const withValidator = createRouter([
    { name: "u", path: "/u/:id?tab" },
  ] as never);

  withValidator.usePlugin(validationPlugin());

  const p2 = mkPatch();

  getRoutesApi(withValidator).update("u", p2.bag as never);
  out["update · patch reads (validation-plugin installed)"] = { ...p2.reads };
  out["update · positive control (validator): defaultSearch landed"] =
    getRoutesApi(withValidator).get("u")?.defaultSearch ===
    p2.bag.defaultSearch;
  withValidator.dispose();
}

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
