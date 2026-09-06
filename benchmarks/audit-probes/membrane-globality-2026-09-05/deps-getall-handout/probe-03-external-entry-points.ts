// Тот же мешок зависимостей на ВНЕШНИХ точках входа (смежное семейство пробела):
//   - `createRequestScope·deps` (`packages/ssr-utils/src/createRequestScope.ts`):
//     `cloneRouter(base, { ...deps, abortSignal: signal })` — SPREAD мешка вызывающего
//     ДО горла `ingestDependencies`: геттер ИСПОЛНЯЕТСЯ и допускается (прямой `cloneRouter`
//     отказывает), Proxy читается spread'ом (профиль ловушек), own `"__proto__"` из
//     JSON.parse доезжает до стора клона; ключ `abortSignal` вызывающего перекрывается;
//   - форма `RequestDepsFactory·return` (`packages/angular/src/providersFactory.ts ·
//     useFactory`): `const requestDeps = deps?.(request); cloneRouter(baseRouter, requestDeps)`
//     — сквозная передача возврата колбэка без промежуточного чтения; воспроизведена той же
//     формой (Angular DI здесь не поднимается): профиль ловушек ≡ дверь `cloneRouter·dependencies`.
// Позитивные контроли: прямой `cloneRouter` с тем же getter-мешком ОТКАЗАН до чтения
// (reads = {}); Proxy-мешок через прямой `cloneRouter` читается ровно один раз на ключ.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";
import { createRequestScope } from "../../../../packages/ssr-utils/src/createRequestScope";

type Bag = Record<string, unknown>;
type Counts = Record<string, number>;

function trapCounter<T extends object>(target: T): { proxy: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const proxy = new Proxy(target, {
    ownKeys(t) {
      bump("ownKeys");
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      bump(`gopd:${String(k)}`);
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
  return { proxy, counts };
}
const attempt = (fn: () => void): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}:${(error as Error).message}`;
  }
};
const protoName = (o: unknown): string => {
  if (o === null || o === undefined || typeof o !== "object") {
    return `not-object:${String(o)}`;
  }
  const p = Object.getPrototypeOf(o) as object | null;
  return p === null
    ? "null"
    : p === Object.prototype
      ? "Object.prototype"
      : "other";
};

const out: Record<string, unknown> = {};
const routes = [{ name: "home", path: "/home" }];
const leaf: Bag = { n: 1 };
const base = createRouter(routes as never, {} as never, {
  db: leaf,
  kept: 1,
} as never);
const request = { signal: new AbortController().signal };

// --- 1. getter-мешок: прямой cloneRouter (контроль) vs createRequestScope ---
const getterBag = countingBag({ x: 1 });
const direct = attempt(() => cloneRouter(base, getterBag.bag as never));
const readsAfterDirect = { ...getterBag.reads };
let scopeGetter: ReturnType<typeof createRequestScope> | undefined;
const viaScope = attempt(() => {
  scopeGetter = createRequestScope(request, base, getterBag.bag as never);
});
const scopedDeps = scopeGetter
  ? getDependenciesApi(scopeGetter.router)
  : undefined;
out.getterBag = {
  control_directCloneRouter: direct,
  control_readsAfterDirect: readsAfterDirect,
  createRequestScope: viaScope,
  readsAfterScope: { ...getterBag.reads },
  xLandedOnClone: scopedDeps?.get("x" as never),
  abortSignalInjected:
    scopedDeps?.get("abortSignal" as never) === request.signal,
  baseLeafShared: scopedDeps?.get("db" as never) === leaf,
};
void scopeGetter?.dispose();

// --- 2. Proxy-мешок: профиль ловушек через createRequestScope vs прямой cloneRouter ---
const directProxy = trapCounter({ traceId: "t", db: { n: 2 } });
const directClone = cloneRouter(base, directProxy.proxy as never);
const directLanded =
  getDependenciesApi(directClone).get("traceId" as never) === "t";
directClone.dispose();
const scopeProxy = trapCounter({ traceId: "t", db: { n: 2 } });
const scope2 = createRequestScope(request, base, scopeProxy.proxy as never);
out.proxyBagTrapProfile = {
  control_directCloneRouter: { landed: directLanded, counts: directProxy.counts },
  createRequestScope: {
    landed: getDependenciesApi(scope2.router).get("traceId" as never) === "t",
    counts: scopeProxy.counts,
  },
};
void scope2.dispose();

// --- 3. own "__proto__" из JSON.parse через createRequestScope ---
const protoDeps = JSON.parse('{"__proto__":{"pwned":"YES"},"k":1}') as Bag;
const scope3 = createRequestScope(request, base, protoDeps as never);
const d3 = getDependenciesApi(scope3.router);
out.ownProtoKeyViaScope = {
  kLanded: d3.get("k" as never) === 1,
  cloneStoreHoldsProtoKey: d3.has("__proto__" as never),
  getAnswers: JSON.stringify(d3.get("__proto__" as never)),
  getAllWithholds: !Object.hasOwn(d3.getAll(), "__proto__"),
  cloneStoreProto: protoName(
    getInternals(scope3.router).dependenciesGetStore().dependencies,
  ),
  baseUntouched: !getDependenciesApi(base).has("__proto__" as never),
};
void scope3.dispose();

// --- 4. caller's abortSignal перекрывается сигналом scope (порядок spread) ---
const callerSignal = new AbortController().signal;
const scope4 = createRequestScope(request, base, {
  abortSignal: callerSignal,
} as never);
out.abortSignalPrecedence = {
  scopeSignalWins:
    getDependenciesApi(scope4.router).get("abortSignal" as never) ===
    request.signal,
  callerSignalDropped:
    getDependenciesApi(scope4.router).get("abortSignal" as never) !==
    callerSignal,
};
void scope4.dispose();

// --- 5. форма RequestDepsFactory·return (angular providersFactory · useFactory) ---
const factoryProxy = trapCounter({ currentUser: "alice", db: leaf });
const depsFactory = (_request: unknown): Bag => factoryProxy.proxy;
const requestDeps = depsFactory(null);
const angularShaped = cloneRouter(base, requestDeps as never);
const undefinedFactory = (_request: unknown): Bag | undefined => undefined;
const angularUndefined = cloneRouter(base, undefinedFactory(null) as never);
const getterFactory = (_request: unknown): Bag => countingBag({ g: 1 }).bag;
out.requestDepsFactoryReturn = {
  landed:
    getDependenciesApi(angularShaped).get("currentUser" as never) === "alice",
  leafShared: getDependenciesApi(angularShaped).get("db" as never) === leaf,
  counts: factoryProxy.counts,
  undefinedReturnClonesBaseDeps:
    getDependenciesApi(angularUndefined).get("kept" as never) === 1,
  getterReturnRefused: attempt(() =>
    cloneRouter(base, getterFactory(null) as never),
  ),
};
angularShaped.dispose();
angularUndefined.dispose();

// --- 6. НЕ-plain формы: spread ДО горла судит КОПИЮ, а не значение вызывающего (форма #1860 / #1911) ---
class Service {
  a = 1;
  method(): void {
    /* nothing */
  }
}
const shapes: readonly (readonly [string, unknown])[] = [
  ["Map([['a',1]])", new Map([["a", 1]])],
  ["class instance {a:1}", new Service()],
  ["array [1,2]", [1, 2]],
  ["string 'nope'", "nope"],
  ["number 7", 7],
  ["null", null],
  ["Object.create(null) {a:1}", Object.assign(Object.create(null), { a: 1 })],
  ["Object.create({inherited:1}) (own: none)", Object.create({ inherited: 1 })],
];
const perShape: Record<string, unknown> = {};
for (const [label, value] of shapes) {
  const directResult = attempt(() => {
    const c = cloneRouter(base, value as never);
    c.dispose();
  });
  let scopeKeys: string[] | undefined;
  const scopeResult = attempt(() => {
    const s = createRequestScope(request, base, value as never);
    scopeKeys = Object.keys(getDependenciesApi(s.router).getAll()).filter(
      (k) => k !== "abortSignal" && k !== "db" && k !== "kept",
    );
    void s.dispose();
  });
  perShape[label] = {
    directCloneRouter: directResult,
    createRequestScope: scopeResult,
    depsLandedOnCloneBeyondBase: scopeKeys,
  };
}
out.nonPlainShapes = perShape;
base.dispose();

console.log(JSON.stringify(out, null, 2));
