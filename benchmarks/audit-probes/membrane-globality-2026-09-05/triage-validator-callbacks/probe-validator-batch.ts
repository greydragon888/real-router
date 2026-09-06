// Триаж-батч «RouterValidator·<arg>»: 12 строк переписи.
//
// Вопрос триажа: параметр валидатора — это ВХОД (объект вызывающего входит в
// состояние ядра ЧЕРЕЗ этот параметр) или ХЭНДАУТ (ядро ОТДАЁТ контейнер коду
// плагина; в состояние ядра он попадает — если попадает — соседней дверью)?
//
// Инструмент: `getInternals(router).validator` присваиваем снаружи. Записывающий
// валидатор (1) фиксирует ИДЕНТИЧНОСТЬ полученного аргумента против объекта,
// помеченного ДО вызова, и (2) МУТИРУЕТ полученный контейнер — так измеряется
// окно между кадром плагина и следующим чтением ядра.
//
// Позитивный контроль: `dependencies.validateDependenciesObject·deps` — строка
// переписи; тот же рекордер обязан дать по ней identity-хит.
// Доказательство «вход дошёл до ветки»: у каждого члена счётчик; нулевой
// счётчик печатается в MEMBER-NOT-CALLED и обесценивает свою строку.
//
// Запуск (из W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/triage-validator-callbacks/probe-validator-batch.ts
import { createRouter } from "@real-router/core";
import {
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Obj = Record<string, unknown>;

const calls: Record<string, number> = {};
const idHits: Record<string, boolean> = {};
const tagged = new WeakMap<object, string>();
let mutator: ((member: string, args: unknown[]) => void) | undefined;

function tag<T extends object>(label: string, o: T): T {
  tagged.set(o, label);

  return o;
}

function record(member: string, args: unknown[]): void {
  calls[member] = (calls[member] ?? 0) + 1;

  for (const a of args) {
    if (a !== null && typeof a === "object") {
      const l = tagged.get(a);

      if (l !== undefined) {
        idHits[`${member}<-${l}`] = true;
      }
    }
  }

  mutator?.(member, args);
}

function group(name: string): unknown {
  return new Proxy(
    {},
    {
      get: (_t, m) =>
        typeof m === "string"
          ? (...args: unknown[]): void => {
              record(`${name}.${m}`, args);
            }
          : undefined,
    },
  );
}

function install(router: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (getInternals(router as any) as any).validator = {
    routes: group("routes"),
    options: group("options"),
    dependencies: group("dependencies"),
    plugins: group("plugins"),
    lifecycle: group("lifecycle"),
    navigation: group("navigation"),
    state: group("state"),
    eventBus: group("eventBus"),
    transition: group("transition"),
  };
}

const out: Record<string, unknown> = {};

async function main(): Promise<void> {

// ── 1. PluginApi.makeState / buildNavigationState / forwardState ────────────
{
  const router = createRouter([{ name: "items", path: "/items/:id?q" }]);

  install(router);

  const api = getPluginApi(router);

  mutator = (member, args) => {
    if (member === "navigation.validateSearch") {
      const s = args[0] as Obj | undefined;

      if (s) {
        s.q = "MUTATED-BY-PLUGIN-FRAME";
      }
    }

    if (
      member === "state.validateMakeStateArgs" ||
      member === "routes.validateStateBuilderArgs"
    ) {
      const p = args[1] as Obj | undefined;

      if (p && typeof p === "object") {
        p.id = "MUTATED-BY-PLUGIN-FRAME";
      }
    }
  };

  const P1 = tag("makeState.params", { id: "1" } as Obj);
  const S1 = tag("makeState.search", { q: "orig" } as Obj);
  const st = api.makeState("items", P1 as never, S1 as never, "/items/1?q=orig");

  out.makeState = {
    validateSearchCalled: calls["navigation.validateSearch"] ?? 0,
    identitySearch:
      idHits["navigation.validateSearch<-makeState.search"] === true,
    identityParams:
      idHits["state.validateMakeStateArgs<-makeState.params"] === true,
    coreReadsAfterFrame_search: st.search.q,
    coreReadsAfterFrame_params: st.params.id,
    stateBagIsCallerBag: (st.search as unknown) === (S1 as unknown),
  };

  const P2 = tag("bns.params", { id: "2" } as Obj);
  const S2 = tag("bns.search", { q: "orig" } as Obj);
  const bns = api.buildNavigationState("items", P2 as never, S2 as never);

  out.buildNavigationState = {
    identitySearch: idHits["navigation.validateSearch<-bns.search"] === true,
    identityParams:
      idHits["routes.validateStateBuilderArgs<-bns.params"] === true,
    coreReadsAfterFrame_search: bns?.search.q,
    coreReadsAfterFrame_params: bns?.params.id,
    stateBagIsCallerBag: (bns?.search as unknown) === (S2 as unknown),
  };

  const P3 = tag("fwd.params", { id: "3" } as Obj);
  const S3 = tag("fwd.search", { q: "orig" } as Obj);
  const fwd = api.forwardState("items", P3 as never, S3 as never) as unknown as {
    params: Obj;
    search: Obj;
  };

  out.forwardState = {
    identityParams:
      idHits["routes.validateStateBuilderArgs<-fwd.params"] === true,
    identitySearch: idHits["navigation.validateSearch<-fwd.search"] === true,
    coreReadsAfterFrame_search: fwd.search.q,
    coreReadsAfterFrame_params: fwd.params.id,
    seamBagIsCallerBag: (fwd.search as unknown) === (S3 as unknown),
  };
  mutator = undefined;
}

// ── 2. buildNavigateState (Router.navigate) ────────────────────────────────
{
  const router = createRouter([{ name: "items", path: "/items/:id?q" }]);

  install(router);
  mutator = (member, args) => {
    if (member === "routes.validateStateBuilderArgs") {
      const p = args[1] as Obj | undefined;

      if (p) {
        p.id = "MUTATED-BY-PLUGIN-FRAME";
      }
    }
  };
  await router.start("/items/0");

  const NP = tag("navigate.params", { id: "7" } as Obj);
  const done = await router.navigate("items", NP as never);

  out.buildNavigateState = {
    validateStateBuilderArgsCalls: calls["routes.validateStateBuilderArgs"] ?? 0,
    identityParams:
      idHits["routes.validateStateBuilderArgs<-navigate.params"] === true,
    coreReadsAfterFrame_params: done.params.id,
    committedBagIsCallerBag: (done.params as unknown) === (NP as unknown),
  };
  mutator = undefined;
}

// ── 3. PluginApi.navigateToState · state / options ─────────────────────────
{
  const router = createRouter([{ name: "items", path: "/items/:id?q" }]);

  install(router);

  const api = getPluginApi(router);

  await router.start("/items/0");
  mutator = (member, args) => {
    if (member === "navigation.validateNavigateToStateArgs") {
      const s = args[0] as Obj;

      s.path = "/items/9?q=MUTATED";
      (s.params as Obj).id = "MUTATED-BY-PLUGIN-FRAME";
      (s.context as Obj).seen = true;
    }

    if (member === "navigation.validateNavigationOptions") {
      (args[0] as Obj).replace = true;
    }
  };

  const ST = tag("nts.state", {
    name: "items",
    params: { id: "5" },
    search: { q: "orig" },
    path: "/items/5?q=orig",
    context: {} as Obj,
  } as Obj);
  const OPT = tag("nts.options", { force: true } as Obj);
  const committed = await api.navigateToState(ST as never, OPT as never);

  out.navigateToState = {
    identityState:
      idHits["navigation.validateNavigateToStateArgs<-nts.state"] === true,
    identityOptions:
      idHits["navigation.validateNavigationOptions<-nts.options"] === true,
    coreReadsAfterFrame_path: committed.path,
    coreReadsAfterFrame_params: committed.params.id,
    committedShellIsCallerShell: (committed as unknown) === (ST as unknown),
    committedParamsIsCallerBag:
      (committed.params as unknown) === (ST.params as unknown),
    committedContextIsCallerContext:
      (committed.context as unknown) === (ST.context as unknown),
  };
  mutator = undefined;
}

// ── 4. RoutesApi.update · updates (три читателя) ───────────────────────────
{
  const router = createRouter([{ name: "x", path: "/x/:id" }]);

  install(router);

  const routes = getRoutesApi(router);
  const seenOrder: string[] = [];

  mutator = (member, args) => {
    if (member.startsWith("routes.validateUpdateRoute")) {
      seenOrder.push(member);

      if (member === "routes.validateUpdateRouteBasicArgs") {
        // `path` is NOT an updatable field (commitRouteUpdate destructures
        // forwardTo/defaultParams/defaultSearch/decodeParams/encodeParams/
        // canActivate/canDeactivate + custom fields), so the mutation has to
        // land on a field the commit actually reads — otherwise the negative
        // is the probe's, not the router's.
        (args[1] as Obj).defaultParams = { id: "MUTATED-BY-PLUGIN-FRAME" };
      }
    }
  };

  const U = tag("update.updates", { forwardTo: null } as Obj);

  routes.update("x", U as never);

  out.updateUpdates = {
    readers: seenOrder,
    identityBasic:
      idHits["routes.validateUpdateRouteBasicArgs<-update.updates"] === true,
    identityPropertyTypes:
      idHits["routes.validateUpdateRoutePropertyTypes<-update.updates"] === true,
    identityValidateUpdateRoute:
      idHits["routes.validateUpdateRoute<-update.updates"] === true,
    coreReadsAfterFrame_defaultParams: router.buildPath("x", {}),
    patchOriginallyEmptyOfDefaults: U.defaultParams !== undefined,
  };
  mutator = undefined;
}

// ── 5. RoutesApi.add · batch (снапшот ядра, отданный плагину) ──────────────
{
  const router = createRouter([]);

  install(router);

  const routes = getRoutesApi(router);
  const CALLER_DEFAULTS = tag("add.defaultParams", { id: "1" } as Obj);
  const CALLER_ROUTE = tag("add.route", {
    name: "y",
    path: "/y/:id",
    defaultParams: CALLER_DEFAULTS,
  } as Obj);
  const CALLER_ARR = tag("add.array", [CALLER_ROUTE]);

  let batchIsCallerArray: unknown;
  let batchElemIsCallerRoute: unknown;
  let nestedDefaultParamsIsCallers: unknown;

  mutator = (member, args) => {
    if (member === "routes.validateAddRouteArgs") {
      const b = args[0] as Obj[];

      batchIsCallerArray = (b as unknown) === (CALLER_ARR as unknown);
      batchElemIsCallerRoute = (b[0] as unknown) === (CALLER_ROUTE as unknown);
      nestedDefaultParamsIsCallers =
        (b[0].defaultParams as unknown) === (CALLER_DEFAULTS as unknown);
      b[0].path = "/mutated/:id";
      (b[0].defaultParams as Obj).id = "MUTATED-BY-PLUGIN-FRAME";
    }
  };

  routes.add(CALLER_ARR as never);

  out.addBatch = {
    validateAddRouteArgsCalls: calls["routes.validateAddRouteArgs"] ?? 0,
    batchIsCallerArray,
    batchElemIsCallerRoute,
    nestedDefaultParamsIsCallers,
    coreReadsBatchBack_path: router.buildPath("y", {}),
    callerRoutePathUntouched: CALLER_ROUTE.path,
    callerDefaultsMutated: CALLER_DEFAULTS.id,
  };
  mutator = undefined;
}

// ── 6. Позитивный контроль: dependencies.validateDependenciesObject·deps ───
{
  const router = createRouter([{ name: "z", path: "/z" }]);

  install(router);

  const deps = getDependenciesApi(router);
  const D = tag("deps.bag", { svc: {} } as Obj);

  deps.setAll(D as never);

  out.positiveControl = {
    called: calls["dependencies.validateDependenciesObject"] ?? 0,
    identity:
      idHits["dependencies.validateDependenciesObject<-deps.bag"] === true,
  };
}

for (const [k, v] of Object.entries(out)) {
  console.log(k, JSON.stringify(v));
}

const notCalled = [
  "navigation.validateSearch",
  "routes.validateStateBuilderArgs",
  "state.validateMakeStateArgs",
  "navigation.validateNavigateToStateArgs",
  "navigation.validateNavigationOptions",
  "routes.validateUpdateRouteBasicArgs",
  "routes.validateUpdateRoutePropertyTypes",
  "routes.validateUpdateRoute",
  "routes.validateAddRouteArgs",
  "dependencies.validateDependenciesObject",
].filter((m) => (calls[m] ?? 0) === 0);

console.log("MEMBER-NOT-CALLED", JSON.stringify(notCalled));
console.log("CALLS", JSON.stringify(calls));
}

void main();
