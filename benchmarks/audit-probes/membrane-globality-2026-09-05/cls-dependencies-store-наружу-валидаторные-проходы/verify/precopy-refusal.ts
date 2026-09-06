// ОПРОВЕРГАТЕЛЬ, линза 1: меняет ли ПРЕДВАРИТЕЛЬНАЯ копия контейнера поведение
// на валидаторных дверях D5 (validateDependenciesObject·deps) и
// D6 (validateCloneArgs·dependencies), и достижима ли (а) копией, которая
// сохраняет дескрипторы и прототип.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

import { validationPlugin } from "../../../../../packages/validation-plugin/src/index";

const routes = [{ name: "a", path: "/a" }] as never;
const out: Record<string, unknown> = {};
const dump = (k: string, v: unknown): void => {
  out[k] = v;
};
const api = (r: unknown) =>
  getDependenciesApi(r as never) as unknown as {
    get: (n: string) => unknown;
    getAll: () => Record<string, unknown>;
    setAll: (d: unknown) => void;
    has: (n: string) => boolean;
  };
const bare = () => createRouter(routes, {} as never, {} as never);
const withPlugin = () => {
  const r = bare();
  (r as unknown as { usePlugin: (p: unknown) => void }).usePlugin(
    validationPlugin() as never,
  );
  return r;
};
const err = (fn: () => unknown): string => {
  try {
    fn();
    return "NO-THROW";
  } catch (e) {
    return `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
};

let getterRuns = 0;
const getterBag = (): Record<string, unknown> => {
  const bag: Record<string, unknown> = {};
  Object.defineProperty(bag, "lazy", {
    enumerable: true,
    configurable: true,
    get: () => {
      getterRuns += 1;
      return { lazy: true };
    },
  });
  return bag;
};
class Svc {
  x = 1;
}
// «Копия контейнера, сохраняющая дескрипторы и прототип» — вариант (а),
// не разрушающий улики, по которым судит плагин.
const faithfulCopy = (o: object): object =>
  Object.create(
    Object.getPrototypeOf(o) as object | null,
    Object.getOwnPropertyDescriptors(o),
  ) as object;

// --- позитивные контроли -----------------------------------------------
const c1 = withPlugin();
const c2 = bare();
dump("controls", {
  plugin_legalSetAll: err(() => {
    api(c1).setAll({ ok: 1 });
  }),
  plugin_legalLanded: api(c1).get("ok") === 1,
  bare_legalSetAll: err(() => {
    api(c2).setAll({ ok: 2 });
  }),
  bare_legalLanded: api(c2).get("ok") === 2,
});

// --- D5: setAll ---------------------------------------------------------
const rBareGetter = bare();
const before = getterRuns;
const bareGetterThrown = err(() => {
  api(rBareGetter).setAll(getterBag());
});
const bareGetterRuns = getterRuns - before;
const rPluginGetter = withPlugin();
const rPluginSpread = withPlugin();
const rPluginFaithful = withPlugin();
const rBareClass = bare();
const rPluginClass = withPlugin();
const rPluginClassFaithful = withPlugin();

dump("D5_setAll", {
  bare_getterBag_thrown: bareGetterThrown,
  bare_getterBag_landed: api(rBareGetter).has("lazy"),
  bare_getterInvocations: bareGetterRuns,
  plugin_getterBag_thrown: err(() => {
    api(rPluginGetter).setAll(getterBag());
  }),
  plugin_getterBag_landed: api(rPluginGetter).has("lazy"),
  plugin_spreadCopy_thrown: err(() => {
    api(rPluginSpread).setAll({ ...getterBag() });
  }),
  plugin_spreadCopy_landed: api(rPluginSpread).has("lazy"),
  plugin_faithfulCopy_thrown: err(() => {
    api(rPluginFaithful).setAll(faithfulCopy(getterBag()));
  }),
  plugin_faithfulCopy_landed: api(rPluginFaithful).has("lazy"),
  bare_classInstance_thrown: err(() => {
    api(rBareClass).setAll(new Svc());
  }),
  bare_classInstance_landed: api(rBareClass).get("x") === 1,
  plugin_classInstance_thrown: err(() => {
    api(rPluginClass).setAll(new Svc());
  }),
  plugin_classFaithfulCopy_thrown: err(() => {
    api(rPluginClassFaithful).setAll(faithfulCopy(new Svc()));
  }),
});

// --- D6: cloneRouter ----------------------------------------------------
const baseP = withPlugin();
const baseB = bare();
dump("D6_clone", {
  control_plugin_legal: err(() =>
    cloneRouter(baseP as never, { ok: 1 } as never),
  ),
  control_bare_legal: err(() => cloneRouter(baseB as never, { ok: 1 } as never)),
  bare_getterBag: err(() => cloneRouter(baseB as never, getterBag() as never)),
  plugin_getterBag: err(() => cloneRouter(baseP as never, getterBag() as never)),
  plugin_spreadCopy: err(() =>
    cloneRouter(baseP as never, { ...getterBag() } as never),
  ),
  plugin_faithfulCopy: err(() =>
    cloneRouter(baseP as never, faithfulCopy(getterBag()) as never),
  ),
  plugin_classInstance: err(() =>
    cloneRouter(baseP as never, new Svc() as never),
  ),
  plugin_classFaithfulCopy: err(() =>
    cloneRouter(baseP as never, faithfulCopy(new Svc()) as never),
  ),
});

console.log(JSON.stringify(out, null, 1));
