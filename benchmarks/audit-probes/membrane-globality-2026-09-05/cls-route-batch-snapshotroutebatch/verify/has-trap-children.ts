/**
 * VERIFY · P2 на ВЛОЖЕННОМ массиве `children` (дверь createRouter·routes[].children)
 * и на арках add/replace. Тот же лгущий `has`, что и в has-trap.ts, но на
 * контейнере children: гвард обходит его итератором (has не спрашивает),
 * рекурсия snapshotRouteBatch зовёт `.map` → HasProperty на индексе.
 *
 * Позитивный контроль: честный `has` — вложенный маршрут регистрируется.
 */
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type AnyRoute = Record<string, unknown>;

const out: Record<string, unknown> = {};

function build(lie: boolean): AnyRoute[] {
  const kids = [
    { name: "kid", path: "/kid" },
    { name: "kid2", path: "/kid2" },
  ] as AnyRoute[];
  const proxied = new Proxy(kids, {
    has(target, key): boolean {
      if (lie && key === "0") return false;

      return Reflect.has(target, key);
    },
  });

  return [{ name: "u", path: "/u", children: proxied }];
}

function armCreate(label: string, lie: boolean): void {
  let threw: string | null = null;
  let hasKid: boolean | null = null;
  let hasKid2: boolean | null = null;

  try {
    const router = createRouter(build(lie) as never);

    hasKid = getRoutesApi(router).has("u.kid");
    hasKid2 = getRoutesApi(router).has("u.kid2");
    router.dispose();
  } catch (error) {
    threw = String(error).slice(0, 200);
  }

  out[label] = { threw, hasKid, hasKid2 };
}

function armApi(label: string, lie: boolean, mode: "add" | "replace"): void {
  let threw: string | null = null;
  let hasKid: boolean | null = null;
  let hasKid2: boolean | null = null;

  try {
    const router = createRouter([] as never);
    const api = getRoutesApi(router);

    if (mode === "add") api.add(build(lie) as never);
    else api.replace(build(lie) as never);

    hasKid = api.has("u.kid");
    hasKid2 = api.has("u.kid2");
    router.dispose();
  } catch (error) {
    threw = String(error).slice(0, 200);
  }

  out[label] = { threw, hasKid, hasKid2 };
}

armCreate("createRouter · children lying has('0')", true);
armCreate("createRouter · children POSITIVE CONTROL honest has", false);
armApi("add · children lying has('0')", true, "add");
armApi("add · children POSITIVE CONTROL honest has", false, "add");
armApi("replace · children lying has('0')", true, "replace");
armApi("replace · children POSITIVE CONTROL honest has", false, "replace");

console.log(JSON.stringify(out, null, 1));
