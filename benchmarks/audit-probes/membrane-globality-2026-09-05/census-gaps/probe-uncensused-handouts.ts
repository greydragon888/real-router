// Census-gap probe: object-typed RETURNS / HANDOUTS on the surveyed interfaces
// (types/api.ts, internals.ts, Router.ts) that the census does not list.
// For each: identity across calls (live vs fresh), Object.isFrozen at the
// levels core owns, and whether a write through the handout reaches core.
// Positive controls: a listed door with a KNOWN outcome, run by the same code.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
const out: Record<string, unknown> = {};
const tryWrite = (fn: () => void): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}`;
  }
};

const routes = [
  {
    name: "u",
    path: "/u/:id?tab",
    children: [{ name: "c", path: "/c/:cid?q" }],
  },
  { name: "home", path: "/home" },
] as never;
const router = createRouter(routes, { defaultRoute: "home" } as never, {
  svc: { n: 1 },
} as never);
const ctx = getInternals(router);
const plugin = getPluginApi(router);

// --- 1. getTree() (PluginApi + RouterInternals): same object? frozen? Map.set?
const t1 = plugin.getTree() as { children: Map<string, unknown>; name: string };
const t2 = ctx.getTree() as unknown as typeof t1;
out.getTree = {
  sameObjectAcrossDoors: t1 === t2,
  sameObjectAcrossCalls: plugin.getTree() === t1,
  isFrozenNode: Object.isFrozen(t1),
  childrenIsMap: t1.children instanceof Map,
  childrenIsFrozen: Object.isFrozen(t1.children),
  mapSetThroughFrozenMap: tryWrite(() => {
    t1.children.set("__probe__", { name: "__probe__" });
  }),
  mapHasProbeAfterSet: t1.children.has("__probe__"),
  mapHasProbeViaSecondCall: (
    ctx.getTree() as unknown as typeof t1
  ).children.has("__probe__"),
};
// clean up so later cells are not polluted
t1.children.delete("__probe__");

// --- 2. getQueryParams(name) / port().queryNames / pathNames: live registry?
const q1 = ctx.getQueryParams("u");
const q2 = ctx.getQueryParams("u");
const port = ctx.port();
const qn = port.queryNames("u");
const pn = port.pathNames("u");
const guardBeforeInjection = tryWrite(() => {
  plugin.buildNavigationState("u", { id: "1", __injected__: "x" } as never);
});
out.getQueryParams = {
  control_guardBeforeInjection: guardBeforeInjection,
  value: [...q1],
  sameArrayAcrossCalls: q1 === q2,
  sameArrayAsPortQueryNames: q1 === qn,
  isFrozen: Object.isFrozen(q1),
  pushThroughHandout: tryWrite(() => {
    (q1 as string[]).push("__injected__");
  }),
  afterPush: [...ctx.getQueryParams("u")],
  // does the injected name now steer the always-on channel guard?
  guardAfterInjection: tryWrite(() => {
    plugin.buildNavigationState("u", { id: "1", __injected__: "x" } as never);
  }),
  pathNamesValue: pn === undefined ? undefined : [...pn],
  pathNamesFrozen: pn === undefined ? undefined : Object.isFrozen(pn),
  pathNamesSameAcrossCalls: pn === port.pathNames("u"),
};
// restore the registry for the cells below
(q1 as string[]).pop();

// --- 3. getMetaForState(name): frozen outer? frozen inner paramTypeMap?
const m1 = ctx.getMetaForState("u.c");
const m2 = ctx.getMetaForState("u.c");
out.getMetaForState = {
  sameAcrossCalls: m1 === m2,
  outerFrozen: m1 === undefined ? undefined : Object.isFrozen(m1),
  outerKeys: m1 === undefined ? undefined : Object.keys(m1),
  outerProto:
    m1 === undefined
      ? undefined
      : Object.getPrototypeOf(m1) === null
        ? "null"
        : "Object.prototype",
  innerFrozen:
    m1 === undefined
      ? undefined
      : Object.values(m1).map((v) => Object.isFrozen(v)),
  innerWrite:
    m1 === undefined
      ? undefined
      : tryWrite(() => {
          (m1["u.c"] as Record<string, string>).__probe__ = "url";
        }),
  innerKeysAfterWrite:
    m1 === undefined ? undefined : Object.keys(m1["u.c"] ?? {}),
};

// --- 4. getCloneState(): fresh shells? frozen leaves?
const c1 = ctx.getCloneState();
const c2 = ctx.getCloneState();
const liveDeps = (ctx.dependenciesGetStore() as { dependencies: { svc: unknown } })
  .dependencies;
out.getCloneState = {
  optionsFreshPerCall: c1.options !== c2.options,
  optionsFrozen: Object.isFrozen(c1.options),
  optionsIsTheFrozenGetOptions: c1.options === plugin.getOptions(),
  dependenciesFreshPerCall: c1.dependencies !== c2.dependencies,
  dependenciesIsLiveStore: c1.dependencies === liveDeps,
  dependencyLeafByReference:
    (c1.dependencies as { svc: unknown }).svc === liveDeps.svc,
  pluginFactoriesFreshPerCall: c1.pluginFactories !== c2.pluginFactories,
  loggerConfigFreshPerCall: c1.loggerConfig !== c2.loggerConfig,
  limitsSameAcrossCalls: c1.limits === c2.limits,
  limitsFrozen: Object.isFrozen(c1.limits),
  limitKeys: c1.limitKeys,
};

// --- 5. getState()/getPreviousState() handout: direct context write bypasses claim.write
await router.start("/home");
const s = router.getState()!;
const foreign = { app: "object" };
const directWrite = tryWrite(() => {
  (s.context as Record<string, unknown>).__direct__ = foreign;
});
const reachesCommittedByIdentity =
  (router.getState()!.context as Record<string, unknown>).__direct__ ===
  foreign;
await router.navigate("u", { id: "1" } as never);
out.getStateContext = {
  stateFrozen: Object.isFrozen(s),
  contextFrozen: Object.isFrozen(s.context),
  directWrite,
  reachesCommittedByIdentity,
  previousStateContextStillCarriesIt:
    (router.getPreviousState()!.context as Record<string, unknown>)
      .__direct__ === foreign,
};

// --- 6. control: a listed door with a known outcome (RoutesApi.get·return — fresh shell)
const api = getRoutesApi(router);
const r1 = api.get("u")!;
const r2 = api.get("u")!;
out.control_RoutesApiGet = {
  freshShell: r1 !== r2,
  shellFrozen: Object.isFrozen(r1),
};

// --- 7. control: matchPath encoder channels — params writable (listed door 89), search frozen
let seenParamsFrozen: boolean | undefined;
let seenSearchFrozen: boolean | undefined;
const r = createRouter(
  [
    {
      name: "e",
      path: "/e/:id?tab",
      encodeParams: (ch: {
        params: Record<string, unknown>;
        search: Record<string, unknown>;
      }) => {
        seenParamsFrozen = Object.isFrozen(ch.params);
        seenSearchFrozen = Object.isFrozen(ch.search);
        return ch;
      },
    },
  ] as never,
  {} as never,
);
const matched = getPluginApi(r).matchPath("/e/1?tab=x");
out.control_matchPathEncoderChannels = {
  matchedName: matched?.name,
  paramsFrozenInsideCodec: seenParamsFrozen,
  searchFrozenInsideCodec: seenSearchFrozen,
};

// --- 8. Plugin.onTransitionStart·toState: the pending shell (same object as GuardFn·toState)?
let hookSawFrozen: boolean | undefined;
let guardSawSame: boolean | undefined;
let hookState: unknown;
const hookValue = { from: "onTransitionStart" };
const r8 = createRouter(
  [
    { name: "home", path: "/home" },
    {
      name: "g",
      path: "/g",
      canActivate: () => (toState: { context: Record<string, unknown> }) => {
        guardSawSame = toState === hookState;
        return true;
      },
    },
  ] as never,
  {} as never,
);
r8.usePlugin(() => ({
  onTransitionStart(toState: { context: Record<string, unknown> }) {
    hookState = toState;
    hookSawFrozen = Object.isFrozen(toState);
    toState.context.__hook__ = hookValue;
  },
}));
await r8.start("/home");
await r8.navigate("g");
out.onTransitionStart_toState = {
  frozenInsideHook: hookSawFrozen,
  guardReceivedSameObject: guardSawSame,
  committedStateIsThatObject: r8.getState() === hookState,
  committedContextCarriesHookValue:
    (r8.getState()!.context as Record<string, unknown>).__hook__ === hookValue,
};

// --- 9. ForwardToCallback·params: does a write inside the callback reach state.params?
const r9 = createRouter(
  [
    { name: "home", path: "/home" },
    {
      name: "a",
      path: "/a/:id",
      forwardTo: (_get: unknown, params: Record<string, unknown>) => {
        params.__fwd__ = "1";
        return "b";
      },
    },
    { name: "b", path: "/b/:id" },
  ] as never,
  {} as never,
);
await r9.start("/home");
const callerBag = { id: "7" };
const s9 = await r9.navigate("a", callerBag as never);
out.forwardToCallback_params = {
  committedName: s9.name,
  callerBagMutated: (callerBag as Record<string, unknown>).__fwd__ === "1",
  reachesStateParams: (s9.params as Record<string, unknown>).__fwd__ === "1",
  control_isActiveRouteAlsoHandsTheBag: (() => {
    const bag2 = { id: "7" };
    r9.isActiveRoute("a", bag2 as never);
    return (bag2 as Record<string, unknown>).__fwd__ === "1";
  })(),
};

  console.log(JSON.stringify(out, null, 2));
}

void main();
