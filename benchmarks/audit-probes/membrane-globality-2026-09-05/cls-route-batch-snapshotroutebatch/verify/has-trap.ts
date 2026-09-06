/**
 * VERIFY · P2 на КОНТЕЙНЕРЕ-МАССИВЕ (createRouter·routes и три арки горла).
 *
 * Классификатор объявил P2 «неприменимо», сославшись на счётчик GET-трапов.
 * Но `Array.prototype.map` выполняет HasProperty(O, Pk) на каждом индексе —
 * трап `has`, т.е. ВОПРОС О КЛЮЧЕ ВЫЗЫВАЮЩЕГО. Лгущий `has` (get отдаёт
 * элемент, has говорит «нет») обязан развести вердикт гварда (обход
 * итератором, has не спрашивает) и содержимое снапшота (дыра).
 *
 * Позитивный контроль: тот же массив с честным `has`.
 * Контроль инструмента: сам `map` действительно спрашивает `has`.
 */
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type AnyRoute = Record<string, unknown>;

const out: Record<string, unknown> = {};

function arm(label: string, lie: boolean): void {
  const asked: string[] = [];
  const routes = [
    { name: "u", path: "/u" },
    { name: "v", path: "/v" },
  ] as AnyRoute[];
  const bag = new Proxy(routes, {
    has(target, key): boolean {
      if (typeof key === "string") asked.push(key);

      if (lie && key === "0") return false;

      return Reflect.has(target, key);
    },
  });
  let threw: string | null = null;
  let hasU: boolean | null = null;
  let hasV: boolean | null = null;

  try {
    const router = createRouter(bag as never);

    hasU = getRoutesApi(router).has("u");
    hasV = getRoutesApi(router).has("v");
    router.dispose();
  } catch (error) {
    threw = String(error).slice(0, 200);
  }

  out[label] = { threw, hasU, hasV, hasTrapKeys: asked };
}

arm("createRouter · lying has('0')", true);
arm("createRouter · POSITIVE CONTROL honest has", false);

{
  const asked: string[] = [];
  const p = new Proxy([{ a: 1 }], {
    has(t, k): boolean {
      if (typeof k === "string") asked.push(k);

      return Reflect.has(t, k);
    },
  });

  p.map((x) => x);
  out["INSTRUMENT CONTROL · map asks has for"] = asked;
}

console.log(JSON.stringify(out, null, 1));
