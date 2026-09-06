// Опровергатель P2 «неприменимо» на массивных дверях.
// props.ts · arrayProbe ставит ТОЛЬКО трап `get` — он физически не мог увидеть
// has/ownKeys/getOwnPropertyDescriptor, а вывод классификатора («ни одного
// вопроса hasOwn/`in` о ключе вызывающего нет») опирается именно на этот
// список. Ставим ВСЕ трапы и печатаем перепись.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

type Trace = Record<string, number>;

function fullProxy(arr: unknown[]): { proxy: unknown[]; trace: Trace } {
  const trace: Trace = {};
  const bump = (t: string, k: PropertyKey): void => {
    const key = `${t}:${typeof k === "symbol" ? k.toString() : String(k)}`;

    trace[key] = (trace[key] ?? 0) + 1;
  };
  const proxy = new Proxy(arr, {
    get(t, k, r): unknown {
      bump("get", k);

      return Reflect.get(t, k, r);
    },
    has(t, k): boolean {
      bump("has", k);

      return Reflect.has(t, k);
    },
    ownKeys(t): ArrayLike<string | symbol> {
      bump("ownKeys", "*");

      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k): PropertyDescriptor | undefined {
      bump("gOPD", k);

      return Reflect.getOwnPropertyDescriptor(t, k);
    },
  });

  return { proxy: proxy as unknown[], trace };
}

// ── арка createRouter: массив батча ───────────────────────────────────────────
{
  const batch = fullProxy([{ name: "u", path: "/u" }]);
  const router = createRouter(batch.proxy as never);

  out["createRouter · batch array ALL traps"] = batch.trace;
  out["createRouter · positive control: registered"] = getRoutesApi(router).has(
    "u",
  );
  router.dispose();
}

// ── арка createRouter: вложенный children ─────────────────────────────────────
{
  const kids = fullProxy([{ name: "kid", path: "/kid" }]);
  const router = createRouter([
    { name: "u", path: "/u", children: kids.proxy },
  ] as never);

  out["createRouter · children array ALL traps"] = kids.trace;
  out["createRouter · positive control: nested registered"] = getRoutesApi(
    router,
  ).has("u.kid");
  router.dispose();
}

// ── арка add ──────────────────────────────────────────────────────────────────
{
  const router = createRouter([{ name: "seed", path: "/seed" }] as never);
  const batch = fullProxy([{ name: "u", path: "/u" }]);

  getRoutesApi(router).add(batch.proxy as never);
  out["add · batch array ALL traps"] = batch.trace;
  out["add · positive control: registered"] = getRoutesApi(router).has("u");
  router.dispose();
}

// ── арка replace ──────────────────────────────────────────────────────────────
{
  const router = createRouter([{ name: "seed", path: "/seed" }] as never);
  const batch = fullProxy([{ name: "u", path: "/u" }]);

  getRoutesApi(router).replace(batch.proxy as never);
  out["replace · batch array ALL traps"] = batch.trace;
  out["replace · positive control: registered"] = getRoutesApi(router).has("u");
  router.dispose();
}

// ── позитивный контроль ИНСТРУМЕНТА: трапы has/ownKeys/gOPD действительно
//    срабатывают, когда их спрашивают ─────────────────────────────────────────
{
  const p = fullProxy([{ name: "z", path: "/z" }]);

  void (0 in p.proxy);
  void Object.keys(p.proxy);
  void Object.getOwnPropertyDescriptor(p.proxy, "0");
  out["control: traps fire when asked"] = p.trace;
}

console.log(JSON.stringify(out, null, 1));
