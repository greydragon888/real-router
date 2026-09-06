// MATRIX B — свойства P1..P4 на двух объектах семейства
// «валидатор·батчи-патчи-и-объекты-маршрута».
//
//   OBJ-1 «patch»  — контейнер ВЫЗЫВАЮЩЕГО (RoutesApi.update), читатели:
//                    validateUpdateRouteBasicArgs → validateUpdateRoutePropertyTypes →
//                    validateUpdateRoute → commitRouteUpdate (+ prepareCustomFields).
//   OBJ-2 «batch»  — снапшот ядра (snapshotRouteBatch) + элементы; читатели —
//                    пять валидаторных дверей семейства + addRoutes/replaceRoutes.
//
// Каждая проба: ДРЕЙФУЮЩИЙ/ЛГУЩИЙ вход + позитивный контроль (тот же код на
// честном входе) + доказательство, что вход дошёл до ветки.
import { createRouter } from "@real-router/core";
import { getRoutesApi, getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";
import {
  countingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";

/* eslint-disable */
type Any = any;
const out: Record<string, unknown>[] = [];
const say = (row: string, data: Record<string, unknown>) =>
  out.push({ row, ...data });

const BASE = [
  { name: "root", path: "/root" },
  { name: "home", path: "/home/:id" },
];
function mk(withPlugin: boolean, routes: Any[] = BASE): Any {
  const r = createRouter(structuredCloneish(routes) as Any, {} as Any);
  if (withPlugin) r.usePlugin(validationPlugin() as Any);
  return r;
}
function structuredCloneish(x: Any): Any {
  return JSON.parse(JSON.stringify(x));
}
const cfg = (r: Any, n: string) => getPluginApi(r).getRouteConfig(n);
const got = (r: Any, n: string) => getRoutesApi(r).get(n) as Any;

// ===========================================================================
// P1 · OBJ-1 «patch» — сколько раз читается КАЖДЫЙ ключ патча
// ===========================================================================
for (const withPlugin of [false, true]) {
  const r = mk(withPlugin);
  const source = {
    forwardTo: "root",
    defaultParams: { id: "1" },
    defaultSearch: { q: "x" },
    decodeParams: (c: Any) => c,
    encodeParams: (c: Any) => c,
    canActivate: () => () => true,
    canDeactivate: () => () => true,
    zzCustom: 42,
  };
  const { bag, reads } = countingBag(source as Any);
  getRoutesApi(r).update("home", bag as Any);
  say("P1 patch · reads per key", {
    plugin: withPlugin,
    reads: { ...reads },
    max: Math.max(...Object.values(reads)),
    applied: {
      forwardTo: got(r, "home").forwardTo,
      defaultParams: got(r, "home").defaultParams,
      zzCustom: (cfg(r, "home") as Any)?.zzCustom,
    },
  });
}

// ===========================================================================
// P1 · OBJ-1 «patch» — ДРЕЙФ: валидаторы видят одно, ядро регистрирует другое
//   forwardTo: чтения 1 и 2 — "root" (валидно), чтение 3 — "ghost" (нет такого
//   маршрута; валидатор такой вход отвергает — см. позитивный контроль).
// ===========================================================================
{
  const armStable = (value: string) => {
    const r = mk(true);
    try {
      getRoutesApi(r).update("home", { forwardTo: value } as Any);
      return { thrown: null as string | null, registered: got(r, "home").forwardTo };
    } catch (e) {
      return { thrown: (e as Error).message, registered: got(r, "home").forwardTo };
    }
  };
  const r = mk(true);
  const { bag, reads } = countingProxy({ forwardTo: "root" } as Any, (key, nth) =>
    key === "forwardTo" ? (nth >= 3 ? "ghost" : "root") : undefined,
  );
  let thrown: string | null = null;
  try {
    getRoutesApi(r).update("home", bag as Any);
  } catch (e) {
    thrown = (e as Error).message;
  }
  say("P1 patch · drifting forwardTo", {
    positiveControl_stableValid: armStable("root"),
    positiveControl_stableGhost: armStable("ghost"),
    driftReads: { ...reads },
    driftThrown: thrown,
    driftRegistered: got(r, "home").forwardTo,
    forwardTargetExists: getRoutesApi(r).has("ghost"),
  });
}

// ===========================================================================
// P1 · OBJ-2 «batch» — чтения ключей объекта ВЫЗЫВАЮЩЕГО при add, и дрейф
// ===========================================================================
{
  const r = mk(true);
  const source = {
    name: "cnt",
    path: "/cnt/:id",
    defaultParams: { id: "1" },
    children: [{ name: "kid", path: "/kid" }],
    zzCustom: 7,
  };
  const { bag, reads } = countingProxy(source as Any);
  getRoutesApi(r).add([bag] as Any);
  say("P1 batch · reads per key of the caller's route", {
    reads: { ...reads },
    max: Math.max(...Object.values(reads)),
    registeredPath: got(r, "cnt").path,
  });
}
{
  const arm = (drift: boolean) => {
    const r = mk(true);
    const { bag, reads } = countingProxy(
      { name: "dr", path: "/first/:id" } as Any,
      (key, nth) =>
        key === "path" && drift && nth >= 2 ? "/second/:id" : ({ name: "dr", path: "/first/:id" } as Any)[key],
    );
    getRoutesApi(r).add([bag] as Any);
    return {
      reads: { ...reads },
      registeredPath: got(r, "dr").path,
      built: r.buildPath("dr", { id: "9" }),
    };
  };
  say("P1 batch · drifting path", {
    positiveControl_stable: arm(false),
    drifting: arm(true),
  });
}

// ===========================================================================
// P2 · лгущий Proxy: ownKeys НЕ называет ключ, gOPD утверждает, что он свой
// ===========================================================================
function lyingProxy(target: Any, hidden: string): Any {
  return new Proxy(target, {
    ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
    getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k),
    get: (t, k, rec) => Reflect.get(t, k, rec),
  });
}
{
  // patch: скрытое CUSTOM-поле (перечисляемая половина двери)
  const arm = (hide: boolean) => {
    const r = mk(true);
    const base = { zzHidden: "SHOULD-NOT-LAND", defaultParams: { id: "1" } };
    getRoutesApi(r).update(
      "home",
      (hide ? lyingProxy(base, "zzHidden") : base) as Any,
    );
    return {
      storedCustom: cfg(r, "home"),
      defaultParams: got(r, "home").defaultParams,
    };
  };
  say("P2 patch · custom key hidden from ownKeys", {
    positiveControl_honest: arm(false),
    lying: arm(true),
  });
}
{
  // patch: скрытое ИМЕНОВАННОЕ поле (читается по имени, не перечислением)
  const arm = (hide: boolean) => {
    const r = mk(true);
    const base = { defaultParams: { id: "HIDDEN" } };
    getRoutesApi(r).update(
      "home",
      (hide ? lyingProxy(base, "defaultParams") : base) as Any,
    );
    return { defaultParams: got(r, "home").defaultParams };
  };
  say("P2 patch · named field hidden from ownKeys", {
    positiveControl_honest: arm(false),
    lying: arm(true),
  });
}
{
  // batch: скрытый ключ элемента маршрута
  const arm = (hide: boolean) => {
    const r = mk(true);
    const base = { name: "ly", path: "/ly", zzHidden: "SHOULD-NOT-LAND" };
    try {
      getRoutesApi(r).add([hide ? lyingProxy(base, "zzHidden") : base] as Any);
    } catch (e) {
      return { thrown: (e as Error).message };
    }
    return { storedCustom: cfg(r, "ly"), registeredPath: got(r, "ly")?.path };
  };
  say("P2 batch · route key hidden from ownKeys", {
    positiveControl_honest: arm(false),
    lying: arm(true),
  });
}

// ===========================================================================
// P3 · унаследованный аксессор под именем ключа + собственный "__proto__"
// ===========================================================================
{
  const NAME = "zzHaz";
  let setterCalls = 0;
  let getterCalls = 0;
  let naiveAssignCaptured: unknown = "not-run";
  const results: Record<string, unknown> = {};
  Object.defineProperty(Object.prototype, NAME, {
    configurable: true,
    get(): unknown {
      getterCalls += 1;
      return "FROM-PROTO-GETTER";
    },
    set(v: unknown): void {
      setterCalls += 1;
      naiveAssignCaptured = v;
    },
  });
  try {
    // позитивный контроль: аксессор жив и перехватывает наивное присваивание
    const canary: Any = {};
    canary[NAME] = "canary";
    results.positiveControl_naiveAssignHitsSetter = setterCalls === 1;
    results.positiveControl_capturedByProtoSetter = naiveAssignCaptured;
    setterCalls = 0;

    // patch-дверь
    const r1 = mk(true);
    let thrown1: string | null = null;
    try {
      getRoutesApi(r1).update("home", { [NAME]: 42 } as Any);
    } catch (e) {
      thrown1 = (e as Error).message;
    }
    const rec1 = cfg(r1, "home") as Any;
    results.patch = {
      thrown: thrown1,
      setterCallsDuringUpdate: setterCalls,
      ownOnRecord: rec1 ? Object.hasOwn(rec1, NAME) : null,
      valueOnRecord: rec1?.[NAME],
    };
    setterCalls = 0;

    // batch-дверь (кастом-поле маршрута)
    const r2 = mk(true);
    let thrown2: string | null = null;
    try {
      getRoutesApi(r2).add([{ name: "hz", path: "/hz", [NAME]: 42 }] as Any);
    } catch (e) {
      thrown2 = (e as Error).message;
    }
    const rec2 = cfg(r2, "hz") as Any;
    results.batch = {
      thrown: thrown2,
      setterCallsDuringAdd: setterCalls,
      ownOnRecord: rec2 ? Object.hasOwn(rec2, NAME) : null,
      valueOnRecord: rec2?.[NAME],
    };
    results.getterCalls = getterCalls;
  } finally {
    delete (Object.prototype as Any)[NAME];
  }
  say("P3 · inherited accessor under the key name", results);
}
{
  // собственный "__proto__" из JSON.parse — в патче и в объекте маршрута
  const patchObj = Object.assign(
    JSON.parse('{"__proto__":{"polluted":"YES"}}') as Any,
    {},
  );
  const r1 = mk(true);
  let t1: string | null = null;
  try {
    getRoutesApi(r1).update("home", patchObj as Any);
  } catch (e) {
    t1 = (e as Error).message;
  }
  const rec1 = cfg(r1, "home") as Any;

  const routeObj = Object.assign(
    JSON.parse('{"__proto__":{"polluted":"YES"}}') as Any,
    { name: "pp", path: "/pp" },
  );
  const r2 = mk(true);
  let t2: string | null = null;
  try {
    getRoutesApi(r2).add([routeObj] as Any);
  } catch (e) {
    t2 = (e as Error).message;
  }
  const rec2 = cfg(r2, "pp") as Any;
  say("P3 · own \"__proto__\" key from JSON.parse", {
    positiveControl_ownKeyExistsOnInput: Object.hasOwn(patchObj, "__proto__"),
    patch: {
      thrown: t1,
      recordOwnProto: rec1 ? Object.hasOwn(rec1, "__proto__") : null,
      recordPrototypeSwapped: rec1 ? Object.getPrototypeOf(rec1) !== Object.prototype : null,
    },
    batch: {
      thrown: t2,
      registeredPath: got(r2, "pp")?.path,
      recordOwnProto: rec2 ? Object.hasOwn(rec2, "__proto__") : null,
      recordPrototypeSwapped: rec2 ? Object.getPrototypeOf(rec2) !== Object.prototype : null,
    },
    globalPolluted: ({} as Any).polluted,
  });
}

// ===========================================================================
// P4 · что заморожено после прохода через дверь
// ===========================================================================
{
  const r = mk(true);
  const leaf: Any = { id: "1" };
  const kids: Any[] = [{ name: "kid", path: "/kid" }];
  const route: Any = {
    name: "fz",
    path: "/fz/:id",
    defaultParams: leaf,
    children: kids,
    zzCustom: { deep: 1 },
  };
  const arr = [route];
  const events: Any[] = [];
  getRoutesApi(r).subscribeChanges((e: Any) => events.push(e));
  getRoutesApi(r).add(arr as Any);

  const patchLeaf: Any = { id: "2" };
  const patch: Any = { defaultParams: patchLeaf, zzCustom: { deep: 2 } };
  getRoutesApi(r).update("home", patch);

  say("P4 · freeze levels", {
    caller_arrayFrozen: Object.isFrozen(arr),
    caller_routeFrozen: Object.isFrozen(route),
    caller_childrenArrayFrozen: Object.isFrozen(kids),
    caller_childRouteFrozen: Object.isFrozen(kids[0]),
    caller_nestedDefaultParamsFrozen: Object.isFrozen(leaf),
    caller_nestedCustomFrozen: Object.isFrozen(route.zzCustom),
    caller_patchFrozen: Object.isFrozen(patch),
    caller_patchNestedFrozen: Object.isFrozen(patchLeaf),
    coreProduced_treeChangedAddedRouteFrozen: Object.isFrozen(events[0].added[0]),
    coreProduced_treeChangedAddedArrayFrozen: Object.isFrozen(events[0].added),
    coreProduced_updatePatchPayloadFrozen: Object.isFrozen(
      events.find((e: Any) => e.op === "update").patch,
    ),
    coreProduced_customFieldRecordFrozen: Object.isFrozen(cfg(r, "fz")),
    handoutLeafIsCallers: got(r, "fz").defaultParams === leaf,
  });
}

// ===========================================================================
// P4-контроль · заморожен ли снапшот, который ядро отдаёт валидаторам
// ===========================================================================
{
  const r = mk(false);
  const seen: Record<string, unknown> = {};
  const validator = new Proxy(
    {},
    {
      get: (_t, group) =>
        new Proxy(
          {},
          {
            get:
              (_t2, m) =>
              (...args: unknown[]) => {
                const key = `${String(group)}.${String(m)}`;
                if (
                  key === "routes.validateRoutes" ||
                  key === "routes.guardRouteCallbacks"
                )
                  seen[key] = {
                    frozen: Object.isFrozen(args[0]),
                    sealed: Object.isSealed(args[0]),
                    extensible: Object.isExtensible(args[0] as object),
                  };
              },
          },
        ),
    },
  );
  (
    require("@real-router/core/validation").getInternals(r) as Any
  ).validator = validator;
  getRoutesApi(r).add([{ name: "sn", path: "/sn" }] as Any);
  say("P4 · the snapshot core hands to the validators", seen);
}

console.log(JSON.stringify(out, null, 1));
