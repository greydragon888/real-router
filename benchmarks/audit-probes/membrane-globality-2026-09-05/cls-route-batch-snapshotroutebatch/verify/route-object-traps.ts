// Полная перепись трапов по ОБЪЕКТУ МАРШРУТА вызывающего (P2-вопрос:
// спрашивают ли про ключ вызывающего has/`in` до того, как его взять).
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};
type Trace = Record<string, number>;

function fullProxy(obj: object): { proxy: object; trace: Trace } {
  const trace: Trace = {};
  const bump = (t: string, k: PropertyKey): void => {
    const key = `${t}:${typeof k === "symbol" ? k.toString() : String(k)}`;

    trace[key] = (trace[key] ?? 0) + 1;
  };
  const proxy = new Proxy(obj, {
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
    getPrototypeOf(t): object | null {
      bump("getProto", "*");

      return Reflect.getPrototypeOf(t);
    },
  });

  return { proxy, trace };
}

for (const arc of ["createRouter", "add", "replace"] as const) {
  const p = fullProxy({
    name: "u",
    path: "/u/:id",
    meta: { a: 1 },
    defaultParams: { id: "1" },
    children: [{ name: "kid", path: "/kid" }],
  });
  const router =
    arc === "createRouter"
      ? createRouter([p.proxy] as never)
      : (() => {
          const r = createRouter([{ name: "seed", path: "/seed" }] as never);

          if (arc === "add") {
            getRoutesApi(r).add([p.proxy] as never);
          } else {
            getRoutesApi(r).replace([p.proxy] as never);
          }

          return r;
        })();

  out[`${arc} · route object ALL traps`] = p.trace;
  out[`${arc} · positive control: registered`] = getRoutesApi(router).has(
    "u.kid",
  );
  router.dispose();
}

// Контроль инструмента: has/ownKeys/gOPD/getProto срабатывают, когда спрошены.
{
  const p = fullProxy({ name: "z" });

  void ("name" in p.proxy);
  void Object.keys(p.proxy);
  void Object.getPrototypeOf(p.proxy);
  out["control: traps fire when asked"] = p.trace;
}

console.log(JSON.stringify(out, null, 1));
