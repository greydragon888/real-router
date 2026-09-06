// L8 «State-образные и options-образные объекты»: пробы МЕХАНИЗМА на дверях,
// где чтение кода не даёт исполняемого доказательства. Каждый блок печатает
// решающие строки и несёт позитивный контроль (вход ДОШЁЛ до ветки).
//
// Формы API — из исходника (Router.ts, api/*.ts, internals.ts, helpers.ts).
import { createRouter, RouterError } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const out = (block: string, data: unknown): void => {
  console.log(`[${block}] ${JSON.stringify(data)}`);
};

async function blockA_navigateOptionsCopy(): Promise<void> {
  const router = createRouter(ROUTES as never);
  let captured: { opts: unknown } | undefined;

  router.usePlugin(() => ({
    onTransitionSuccess(_to, _from, opts) {
      captured = { opts };
    },
  }));
  await router.start("/home");

  const controller = new AbortController();
  const original = countingBag({
    replace: false,
    source: "memory-plugin-marker", // произвольный ключ (module augmentation)
    signal: controller.signal,
  });

  const state = await router.navigate("u", { id: "7" }, {}, original.bag as never);
  const received = captured?.opts as Record<string, unknown>;

  out("A navigate·options", {
    control_committed: state.name,
    receivedIsOriginal: received === original.bag,
    receivedFrozen: Object.isFrozen(received),
    customKeySurvives: received.source,
    signalDropped: !("signal" in received),
    readsOfCallerBag: original.reads, // ожидание: по 1 на ключ, signal включительно
  });
  router.dispose();
}

async function blockB_systemCommitIdentity(): Promise<void> {
  const router = createRouter(ROUTES as never);
  let captured:
    | { to: unknown; from: unknown; opts: unknown }
    | undefined;

  router.usePlugin(() => ({
    onTransitionSuccess(to, from, opts) {
      captured = { to, from, opts };
    },
  }));
  await router.start("/home");

  let transitionReads = 0;
  const foreignParams = { id: "7" };
  const foreignContext = { ns: { a: 1 } };
  const foreignTransition = {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: ["u"], intersection: "" },
  };
  const foreignTo = {
    name: "u",
    params: foreignParams,
    search: {},
    path: "/u/7",
    context: foreignContext,
    get transition() {
      transitionReads += 1;

      return foreignTransition;
    },
  };
  const foreignFrom = {
    name: "home",
    params: {},
    search: {},
    path: "/home",
    context: {},
  };
  const opts = { replace: true, marker: "from-caller" };

  const committed = getInternals(router).systemCommit(
    foreignTo as never,
    foreignFrom as never,
    opts as never,
  );

  out("B systemCommit", {
    control_committedName: router.getState()?.name,
    returnedIsGetState: committed === router.getState(),
    toCopied: committed !== (foreignTo as unknown),
    paramsCopied: committed.params !== foreignParams,
    paramsFrozen: Object.isFrozen(committed.params),
    contextCopied: committed.context !== foreignContext,
    contextLeafByRef: committed.context.ns === foreignContext.ns,
    transitionCopied: committed.transition !== (foreignTransition as unknown),
    transitionReadsOnCallerShell: transitionReads, // семя #2008: ожидание 1
    optsHandedByReference: captured?.opts === opts,
    fromHandedByReference: captured?.from === foreignFrom,
    fromNotStoredAsPrevious: router.getPreviousState() !== (foreignFrom as unknown),
  });
  router.dispose();
}

async function blockC_shouldUpdateNodeIdentityCache(): Promise<void> {
  const router = createRouter(ROUTES as never);

  await router.start("/home");

  const pred = router.shouldUpdateNode("u");
  const toParams = countingProxy({ id: "7" });
  const fromParams = countingProxy({ id: "8" });
  const mkState = (name: string, params: object, path: string) =>
    ({ name, params, search: {}, path, context: {}, transition: undefined }) as never;
  const to = mkState("u", toParams.bag, "/u/7");
  const from = mkState("u", fromParams.bag, "/u/8");

  const r1 = pred(to, from);
  const after1 = { ...toParams.reads };
  const r2 = pred(to, from); // те же объекты → кеш по идентичности
  const after2 = { ...toParams.reads };
  const fromAgain = mkState("u", countingProxy({ id: "8" }).bag, "/u/8");
  const r3 = pred(to, fromAgain); // новый объект, те же значения → пересчёт
  const after3 = { ...toParams.reads };

  out("C shouldUpdateNode", {
    control_results: [r1, r2, r3],
    readsAfterFirstCall: after1,
    readsAfterSameObjectsSecondCall: after2, // ожидание: без прироста
    readsAfterFreshFromObject: after3, // ожидание: прирост (кеш промахнулся)
  });
  router.dispose();
}

async function blockD_areStatesEqualReads(): Promise<void> {
  const router = createRouter(ROUTES as never);
  const p1 = countingProxy({ id: "7" });
  const p2 = countingProxy({ id: "7" });
  const s1 = countingProxy({ name: "u", params: p1.bag, search: { tab: "x" }, path: "/u/7" });
  const s2 = countingProxy({ name: "u", params: p2.bag, search: { tab: "x" }, path: "/u/7" });

  const eqPath = router.areStatesEqual(s1.bag as never, s2.bag as never, true);
  const shellAfterPath = { s1: { ...s1.reads }, s2: { ...s2.reads } };
  const paramsAfterPath = { p1: { ...p1.reads }, p2: { ...p2.reads } };
  const eqBoth = router.areStatesEqual(s1.bag as never, s2.bag as never, false);

  out("D areStatesEqual", {
    control_answers: [eqPath, eqBoth],
    shellReadsAfterPathOnly: shellAfterPath,
    paramsReadsAfterPathOnly: paramsAfterPath,
    shellReadsAfterBoth: { s1: s1.reads, s2: s2.reads },
    paramsReadsAfterBoth: { p1: p1.reads, p2: p2.reads },
  });
  router.dispose();
}

async function blockE_codecReturns(): Promise<void> {
  const encP = countingProxy({ id: "9" });
  const encS = countingProxy({ tab: "z" });
  const decP = countingProxy({ id: "1" });
  const decS = countingProxy({ tab: "a" });
  const router = createRouter([
    {
      name: "e",
      path: "/e/:id?tab",
      encodeParams: () => ({ params: encP.bag, search: encS.bag }),
    },
    {
      name: "d",
      path: "/d/:id?tab",
      decodeParams: () => ({ params: decP.bag, search: decS.bag }),
    },
    { name: "home", path: "/home" },
  ] as never);

  const href = router.buildPath("e", { id: "1" }, { tab: "a" });
  const matched = getPluginApi(router).matchPath("/d/1?tab=a");

  out("E codec returns", {
    control_href: href, // ожидание: /e/9?tab=z — возврат энкодера ДОШЁЛ до печати
    encoderReturnReads: { params: encP.reads, search: encS.reads },
    control_matched: matched && { name: matched.name, params: matched.params, search: matched.search },
    decoderReturnReads: { params: decP.reads, search: decS.reads },
    decodedParamsCopied: matched?.params !== decP.bag,
    decodedSearchCopied: matched?.search !== decS.bag,
  });
  router.dispose();
}

async function blockF_claimWrite(): Promise<void> {
  const router = createRouter(ROUTES as never);
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace("ns");

  await router.start("/home");

  const value = { payload: 1 };
  const foreignContext: Record<string, unknown> = {};
  const foreignState = { name: "u", params: {}, search: {}, path: "/u/1", context: foreignContext };

  claim.write(foreignState as never, value);
  claim.write(router.getState() as never, value);

  out("F claim.write", {
    writesIntoCallerObject: foreignContext.ns === value,
    coreContextLeafByRef: router.getState()?.context.ns === value,
  });
  router.dispose();
}

async function blockG_internalsMatchPathOptions(): Promise<void> {
  const router = createRouter(ROUTES as never);
  const opts = countingBag({
    rewritePathOnMatch: true,
    trailingSlash: "preserve",
    queryParamsMode: "loose",
    caseSensitive: true,
    urlParamsEncoding: "default",
    allowNotFound: true,
    defaultRoute: "",
  });
  const st = getInternals(router).matchPath("/u/1?tab=x", opts.bag as never);

  out("G internals.matchPath·options", {
    control_matched: st?.name,
    readsOfCallerOptions: opts.reads, // читается ПО ИМЕНИ; ничего не хранится
  });
  router.dispose();
}

async function blockH_extendRouter(): Promise<void> {
  const router = createRouter(ROUTES as never);
  const api = getPluginApi(router);
  let protoOutcome: string;

  try {
    api.extendRouter(JSON.parse('{"__proto__": {"x": 1}, "zz": 2}') as never);
    protoOutcome = "accepted";
  } catch (error) {
    protoOutcome = `refused: ${(error as RouterError).code}`;
  }

  const ext = countingBag({ foo: () => "foo" });

  api.extendRouter(ext.bag as never);

  const plain: Record<string, unknown> = { bar: 1 };

  api.extendRouter(plain);
  plain.bar = 2;

  out("H extendRouter", {
    ownProtoKey: protoOutcome,
    readsOfExtensions: ext.reads, // ожидание: foo: 1
    installedFoo: typeof (router as Record<string, unknown>).foo,
    containerNotHeld: (router as Record<string, unknown>).bar, // ожидание: 1
    ownDescriptorWritable: Object.getOwnPropertyDescriptor(router, "bar")?.writable,
  });
  router.dispose();
}

function blockI_routerErrorBag(): void {
  const bag: Record<string, unknown> = { message: "m", custom: { a: 1 } };
  const err = new RouterError("X", bag as never);
  const before = err.custom;

  bag.custom = "changed";

  out("I RouterError·options", {
    copiedAtConstruction: err.custom === before && err.custom !== bag.custom,
    ownKey: Object.hasOwn(err, "custom"),
    leafByRef: (err.custom as { a: number }).a === 1,
  });
}

function blockJ_hydrationSlot(): void {
  const router = createRouter(ROUTES as never);
  const ctx = getInternals(router);
  const obj = { name: "u", params: {}, search: {}, path: "/u/1", context: {} };

  ctx.hydrationState = obj as never;

  out("J internals.hydrationState", {
    slotHoldsCallerObjectByIdentity: ctx.hydrationState === (obj as unknown),
  });
  ctx.hydrationState = null;
  router.dispose();
}

async function blockK_navigateDescriptor(): Promise<void> {
  const router = createRouter(ROUTES as never);

  await router.start("/home");

  const target = countingBag({ name: "u", params: { id: "7" }, search: { tab: "x" } });
  const st = await router.navigate(target.bag as never);

  out("K navigate·target", {
    control_committed: st.path,
    readsOfDescriptor: target.reads, // ожидание: name 1, params 1, search 1
  });
  router.dispose();
}

function blockL_cloneRouterBags(): void {
  const base = createRouter(ROUTES as never);
  const opts = countingBag({ logger: { level: "none" } });
  const deps = countingProxy({ svc: 1 });
  const clone = cloneRouter(base, deps.bag as never, opts.bag as never);

  out("L cloneRouter", {
    control_cloned: typeof clone.navigate,
    readsOfCloneOptions: opts.reads, // ожидание: logger 1
    readsOfDependencies: deps.reads, // ожидание: svc 1
  });
  clone.dispose();
  base.dispose();
}

async function blockM_routeDefaultsHandle(): Promise<void> {
  const D: Record<string, string> = { z: "1" };
  const router = createRouter([
    { name: "u", path: "/u/:id?tab", defaultParams: D },
    { name: "home", path: "/home" },
  ] as never);

  await router.start("/home");

  const first = await router.navigate("u", { id: "1" });

  D.z = "late";
  D.w = "new";

  const second = await router.navigate("u", { id: "2" });
  const DS: Record<string, string> = { tab: "d" };

  getRoutesApi(router).update("u", { defaultSearch: DS });
  DS.tab = "late-search";

  const third = await router.navigate("u", { id: "3" });

  out("M routes[].defaultParams / update.defaultSearch", {
    control_firstZ: first.params.z,
    secondZ: second.params.z, // ожидание: "late" — ручка держится, читается на каждой навигации
    secondW: second.params.w,
    thirdTab: third.search.tab, // ожидание: "late-search"
    getHandsOutSameObject: getRoutesApi(router).get("u")?.defaultParams === D,
    getHandsOutSameSearch: getRoutesApi(router).get("u")?.defaultSearch === DS,
  });
  router.dispose();
}

function blockN_optionsContainer(): void {
  const opts = {
    defaultRoute: "home",
    limits: { maxListeners: 30 },
    queryParams: { arrayFormat: "brackets" },
  };
  const router = createRouter(ROUTES as never, opts as never);
  const got = getPluginApi(router).getOptions();
  const store = getInternals(router).routeGetStore();

  out("N createRouter·options", {
    containerCopied: (got as unknown) !== opts,
    containerFrozen: Object.isFrozen(got),
    limitsLeafByRef: got.limits === opts.limits,
    queryParamsLeafByRef: got.queryParams === opts.queryParams,
    matcherQueryParamsSnapshotted: store.matcherOptions?.queryParams !== opts.queryParams,
    matcherQueryParamsFrozen: Object.isFrozen(store.matcherOptions?.queryParams),
  });
  router.dispose();
}

async function blockO_navigateToStateCopies(): Promise<void> {
  const router = createRouter(ROUTES as never);
  let capturedOpts: unknown;

  router.usePlugin(() => ({
    onTransitionSuccess(_to, _from, opts) {
      capturedOpts = opts;
    },
  }));
  await router.start("/home");

  const foreign = {
    name: "u",
    params: { id: "5" },
    search: { tab: "q" },
    path: "/u/5?tab=q",
    context: { ns: 1 },
    transition: { phase: "activating", reason: "success", segments: { deactivated: [], activated: [], intersection: "" } },
  };
  const opts = { replace: true, custom: "k" };
  const committed = await getPluginApi(router).navigateToState(foreign as never, opts as never);

  out("O navigateToState", {
    control_committed: committed.path,
    shellCopied: committed !== (foreign as unknown),
    paramsCopied: committed.params !== foreign.params,
    searchCopied: committed.search !== foreign.search,
    contextCopied: committed.context !== foreign.context,
    transitionReplaced: committed.transition !== (foreign.transition as unknown),
    pathVerbatim: committed.path === foreign.path,
    optsCopiedForHooks: capturedOpts !== opts,
    optsCustomKeySurvives: (capturedOpts as Record<string, unknown>).custom,
  });
  router.dispose();
}

async function main(): Promise<void> {
  const blocks: [string, () => unknown][] = [
    ["A", blockA_navigateOptionsCopy],
    ["B", blockB_systemCommitIdentity],
    ["C", blockC_shouldUpdateNodeIdentityCache],
    ["D", blockD_areStatesEqualReads],
    ["E", blockE_codecReturns],
    ["F", blockF_claimWrite],
    ["G", blockG_internalsMatchPathOptions],
    ["H", blockH_extendRouter],
    ["I", blockI_routerErrorBag],
    ["J", blockJ_hydrationSlot],
    ["K", blockK_navigateDescriptor],
    ["L", blockL_cloneRouterBags],
    ["M", blockM_routeDefaultsHandle],
    ["N", blockN_optionsContainer],
    ["O", blockO_navigateToStateCopies],
  ];

  for (const [name, run] of blocks) {
    try {
      await run();
    } catch (error) {
      out(`${name} THREW`, String(error));
    }
  }
}

void main();
