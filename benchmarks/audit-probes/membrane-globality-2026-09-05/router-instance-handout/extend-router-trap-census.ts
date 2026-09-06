// Известная дверь PluginApi.extendRouter·extensions — перепись ловушек на мешке
// вызывающего (ownKeys / getOwnPropertyDescriptor / get / has / getPrototypeOf)
// и доказательство, что `key in router` задаётся ИНСТАНСУ ядра, не мешку.
// Плюс: own-ключ "__proto__" из JSON.parse и "toString" отвергаются гейтом `in`.
import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const routes = [{ name: "home", path: "/" }] as never;

function codeOf(fn: () => void): string {
  try {
    fn();
    return "NO_THROW";
  } catch (error) {
    return error instanceof RouterError
      ? error.code
      : `NON_ROUTER_ERROR:${String(error)}`;
  }
}

const counts: Record<string, number> = {};
const bump = (trap: string): void => {
  counts[trap] = (counts[trap] ?? 0) + 1;
};
const source: Record<string, unknown> = {
  alpha: () => 1,
  beta: { b: 2 },
  gamma: "g",
};
const bag = new Proxy(source, {
  ownKeys(t) {
    bump("ownKeys");
    return Reflect.ownKeys(t);
  },
  getOwnPropertyDescriptor(t, k) {
    bump("getOwnPropertyDescriptor");
    return Reflect.getOwnPropertyDescriptor(t, k);
  },
  get(t, k, r) {
    bump(`get:${String(k)}`);
    return Reflect.get(t, k, r);
  },
  has(t, k) {
    bump(`has:${String(k)}`);
    return Reflect.has(t, k);
  },
  getPrototypeOf(t) {
    bump("getPrototypeOf");
    return Reflect.getPrototypeOf(t);
  },
});

const router = createRouter(routes, {} as never);
const un = getPluginApi(router).extendRouter(bag);
const installed = {
  alphaSameRef: (router as Record<string, unknown>).alpha === source.alpha,
  betaSameRef: (router as Record<string, unknown>).beta === source.beta,
};
un();
const afterUnsub = { alphaGone: !Object.hasOwn(router, "alpha") };

// гейт `in`: own "__proto__" из JSON.parse, "toString", "constructor", фасадный метод
const r2 = createRouter(routes, {} as never);
const gate = {
  ownProtoFromJson: codeOf(() =>
    getPluginApi(r2).extendRouter(
      JSON.parse('{"__proto__":{"polluted":1}}') as never,
    ),
  ),
  toString: codeOf(() =>
    getPluginApi(r2).extendRouter({ toString: () => "x" }),
  ),
  constructor: codeOf(() => getPluginApi(r2).extendRouter({ constructor: 1 })),
  facadeMethod_navigate: codeOf(() =>
    getPluginApi(r2).extendRouter({ navigate: 1 }),
  ),
  expected: errorCodes.PLUGIN_CONFLICT,
  routerProtoIntact: Object.getPrototypeOf(r2) !== null && !("polluted" in r2),
};

console.log(
  JSON.stringify({ trapCounts: counts, installed, afterUnsub, gate }, null, 1),
);
