// MATRIX C — добор к P1/P3 семейства «валидатор·батчи-патчи-и-объекты-маршрута».
//
// C1. Единственный ключ объекта ВЫЗЫВАЮЩЕГО, который ядро читает ДВАЖДЫ до
//     снапшота, — `children` (guardRouteStructure, затем spread в
//     snapshotRouteBatch). Дрейф по нему: структурный always-on гвард судит
//     первое чтение, снапшот (и, значит, ВСЕ пять валидаторных дверей этого
//     семейства) получает второе.
// C2. Явная печать глобального загрязнения после ключа "__proto__" (в matrix-b
//     значение `undefined` съедала JSON-сериализация).
import { createRouter } from "@real-router/core";
import { getRoutesApi, getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";
import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

/* eslint-disable */
type Any = any;
const out: Record<string, unknown>[] = [];

function mk(): Any {
  const r = createRouter(
    [{ name: "root", path: "/root" }, { name: "home", path: "/home/:id" }] as Any,
    {} as Any,
  );
  r.usePlugin(validationPlugin() as Any);
  return r;
}

// --- C1 -------------------------------------------------------------------
{
  const honestKids = [{ name: "kid", path: "/kid" }];
  // Второй набор детей — форма, которую always-on guardRouteStructure ОТВЕРГАЕТ
  // (аксессор на объекте маршрута). Позитивный контроль ниже показывает отказ.
  const makeAccessorKid = (): Any => {
    const kid: Any = { name: "kid", path: "/kid" };
    Object.defineProperty(kid, "zzAcc", {
      enumerable: true,
      configurable: true,
      get: () => "accessor-value",
    });
    return [kid];
  };

  const arm = (drift: boolean) => {
    const r = mk();
    const base: Any = { name: "dk", path: "/dk", children: honestKids };
    const { bag, reads } = countingProxy(base, (key, nth) =>
      key === "children" && drift && nth >= 2 ? makeAccessorKid() : base[key],
    );
    let thrown: string | null = null;
    try {
      getRoutesApi(r).add([bag] as Any);
    } catch (e) {
      thrown = (e as Error).message;
    }
    const kid = getRoutesApi(r).get("dk.kid") as Any;
    return {
      reads: { ...reads },
      thrown,
      kidRegistered: kid ? kid.path : null,
      kidCustomFields: getPluginApi(r).getRouteConfig("dk.kid"),
    };
  };

  // Позитивный контроль: тот же набор детей, поданный ЧЕСТНО (одно значение на
  // все чтения), always-on гвардом отвергается.
  const control = (() => {
    const r = mk();
    try {
      getRoutesApi(r).add([
        { name: "dk", path: "/dk", children: makeAccessorKid() },
      ] as Any);
      return "NO THROW";
    } catch (e) {
      return (e as Error).message;
    }
  })();

  out.push({
    row: "C1 batch · drifting `children` (the one twice-read caller key)",
    positiveControl_accessorChildRefusedWhenHonest: control,
    stable: arm(false),
    drifting: arm(true),
  });
}

// --- C2 -------------------------------------------------------------------
{
  const r = mk();
  getRoutesApi(r).update(
    "home",
    JSON.parse('{"__proto__":{"polluted":"YES"}}') as Any,
  );
  const r2 = mk();
  getRoutesApi(r2).add([
    Object.assign(JSON.parse('{"__proto__":{"polluted":"YES"}}') as Any, {
      name: "pp",
      path: "/pp",
    }),
  ] as Any);
  out.push({
    row: "C2 · prototype pollution after an own \"__proto__\" key",
    globalPollutedAfterUpdate: String(({} as Any).polluted),
    globalPollutedAfterAdd: String(({} as Any).polluted),
    updateRecordProtoIsObjectPrototype:
      Object.getPrototypeOf(getPluginApi(r).getRouteConfig("home") as Any) ===
      Object.prototype,
    addRecordProtoIsObjectPrototype:
      Object.getPrototypeOf(getPluginApi(r2).getRouteConfig("pp") as Any) ===
      Object.prototype,
  });
}

console.log(JSON.stringify(out, null, 1));
