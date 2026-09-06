// P2 / P3b / P4 для двух дверей семейства, чей ЕДИНСТВЕННЫЙ наружный результат
// в матрице — boolean: строка матрицы там не различает «ключ не попал» от
// «ключ попал, но булев ответ его не показывает» (слепота инструмента, не
// вердикт). Здесь у обеих дверей появляется наблюдатель query-канала:
//
//   Router.canNavigateTo·search — canActivate из конфига маршрута: ядро зовёт
//     гвард с ТРАНЗИЕНТНЫМ toState, чей `search` и есть объект этой двери.
//   Router.isActiveRoute·search — пятый аргумент ignoreQueryParams = false
//     (по умолчанию TRUE, и с ним query-канал на вердикт не влияет вовсе —
//     проба дала бы ложный ноль), активное состояние подобрано так, что
//     попадание ключа МЕНЯЕТ вердикт.
import { createRouter } from "@real-router/core";

type Obs = Record<string, unknown>;
type Bag = Record<string, unknown>;

const out: Record<string, unknown> = {};

/** Роутер с гвардом-наблюдателем на маршруте `u`. */
function withGuard(mode = "default"): {
  router: ReturnType<typeof createRouter>;
  seen: Obs[];
} {
  const seen: Obs[] = [];
  const routes = [
    {
      name: "u",
      path: "/u/:id?tab",
      canActivate: () => (toState: Obs) => {
        const s = toState.search as Bag;
        seen.push({
          searchKeys: Object.keys(s ?? {}),
          searchValues: JSON.stringify(s ?? {}),
          searchFrozen: Object.isFrozen(s),
          protoIsObjectPrototype:
            s === undefined ? undefined : Object.getPrototypeOf(s) === Object.prototype,
          path: toState.path,
        });
        return true;
      },
    },
    { name: "plain", path: "/plain/:id" },
  ] as never;
  const router = createRouter(routes, { queryParamsMode: mode } as never);
  router.start("/plain/1");
  return { router, seen };
}

const lyingProxy = (honest: boolean): { bag: Bag; asked: string[] } => {
  const asked: string[] = [];
  const target: Bag = {};
  if (honest) {
    target.tab = "LEAKED";
  }
  const bag = new Proxy(target, {
    ownKeys(t) {
      asked.push("ownKeys");
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      asked.push(`gOPD:${String(k)}`);
      if (k === "tab") {
        return {
          value: "LEAKED",
          enumerable: true,
          configurable: true,
          writable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, rec) {
      asked.push(`get:${String(k)}`);
      if (k === "tab") return "LEAKED";
      return Reflect.get(t, k, rec);
    },
    has(t, k) {
      asked.push(`has:${String(k)}`);
      return k === "tab" || Reflect.has(t, k);
    },
  }) as Bag;
  return { bag, asked };
};

// ============================================================================
// canNavigateTo·search — наблюдатель = toState в canActivate.
// ============================================================================
{
  const arm = (bag: Bag): Obs => {
    const { router, seen } = withGuard();
    const verdict = router.canNavigateTo("u", { id: "7" } as never, bag as never);
    return { verdict, seen };
  };

  // Позитивный контроль: легальный объявленный ключ ДОЛЖЕН быть виден гварду.
  out["canNavigateTo·0·positiveControl"] = arm({ tab: "x" });

  const lying = lyingProxy(false);
  const honest = lyingProxy(true);
  out["canNavigateTo·P2"] = {
    lying: { asked: lying.asked, ...arm(lying.bag) },
    controlHonestOwnKeys: { asked: honest.asked, ...arm(honest.bag) },
  };

  const protoBag = JSON.parse('{"tab":"x","__proto__":{"polluted":true}}') as Bag;
  out["canNavigateTo·P3b"] = {
    bagHasOwnProto: Object.hasOwn(protoBag, "__proto__"),
    ...arm(protoBag),
    globalPolluted: (({}) as Bag).polluted !== undefined,
  };

  const leaf = ["a", "b"];
  const bag: Bag = { tab: leaf };
  const res = arm(bag);
  out["canNavigateTo·P4"] = {
    ...res,
    callerBagFrozenAfter: Object.isFrozen(bag),
    callerLeafFrozenAfter: Object.isFrozen(leaf),
  };
}

// ============================================================================
// isActiveRoute·search — ignoreQueryParams=false, активное состояние /u/7?tab=x.
// Попадание ключа `tab` со значением "LEAKED" сделало бы вердикт FALSE
// (не совпадает с активным "x"); ключ, который НЕ попал, оставляет пустой
// pending-мешок → вердикт зависит от strictEquality/сравнения — поэтому
// решающим взят вход, где активное состояние ПУСТО по query.
// ============================================================================
{
  const armAgainstEmptyActive = (bag: Bag): unknown => {
    const r = createRouter(
      [
        { name: "u", path: "/u/:id?tab" },
        { name: "plain", path: "/plain/:id" },
      ] as never,
      { queryParamsMode: "default" } as never,
    );
    r.start("/u/7"); // активное состояние БЕЗ query
    return r.isActiveRoute(
      "u",
      { id: "7" } as never,
      bag as never,
      false,
      false,
    );
  };

  out["isActiveRoute·0·positiveControl"] = {
    // ключ ДОШЁЛ ⇒ расхождение с пустым активным ⇒ false
    declaredKeyPresent: armAgainstEmptyActive({ tab: "x" }),
    // пустой мешок ⇒ совпадение ⇒ true
    emptyBag: armAgainstEmptyActive({}),
  };

  const lying = lyingProxy(false);
  const honest = lyingProxy(true);
  out["isActiveRoute·P2"] = {
    lyingVerdict: armAgainstEmptyActive(lying.bag),
    lyingAsked: lying.asked,
    controlHonestVerdict: armAgainstEmptyActive(honest.bag),
    controlHonestAsked: honest.asked,
  };

  const protoBag = JSON.parse('{"__proto__":{"polluted":true}}') as Bag;
  out["isActiveRoute·P3b"] = {
    bagHasOwnProto: Object.hasOwn(protoBag, "__proto__"),
    // собственный "__proto__" дропается ⇒ пустой pending ⇒ true
    verdict: armAgainstEmptyActive(protoBag),
    globalPolluted: (({}) as Bag).polluted !== undefined,
  };

  const leaf = ["a", "b"];
  const bag: Bag = { tab: leaf };
  const verdict = armAgainstEmptyActive(bag);
  out["isActiveRoute·P4"] = {
    verdict,
    callerBagFrozenAfter: Object.isFrozen(bag),
    callerLeafFrozenAfter: Object.isFrozen(leaf),
  };
}

console.log(JSON.stringify(out, null, 1));
