// Door: RouteResolver.pathNames·return — the `store.urlParamsCache` entry
// filled by `RoutesNamespace/helpers.ts · urlParamsFor` (via `urlParamsOf`),
// handed out live through `getInternals(router).port().pathNames(name)`.
// The same array feeds `StateNamespace.areStatesEqual` (the strict slot
// comparison, `helpers.ts · slotsShallowEqual`) and therefore `navigate`'s
// SAME_STATES refusal and `isActiveRoute`'s exact arm.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;

const tryRun = (fn: () => unknown): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}`;
  }
};
const tryAsync = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
    return "resolved";
  } catch (error) {
    const err = error as { code?: string; constructor: { name: string } };
    return `reject:${err.code ?? err.constructor.name}`;
  }
};

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
] as never;

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const router = createRouter(ROUTES, { defaultRoute: "home" } as never);
  const ctx = getInternals(router);
  const api = getPluginApi(router);
  const routes = getRoutesApi(router);
  const port = ctx.port();
  await router.start("/home");

  // 1. identity / frozenness
  const p1 = port.pathNames("u");
  const p2 = port.pathNames("u");
  const tree = api.getTree() as { children: Map<string, AnyRec> };
  const nodeUrlParams = (tree.children.get("u") as { paramMeta: { urlParams: readonly string[] } }).paramMeta.urlParams;
  out.handout = {
    value: p1 === undefined ? undefined : [...p1],
    sameArrayAcrossCalls: p1 === p2,
    isFrozen: p1 === undefined ? undefined : Object.isFrozen(p1),
    // the tree node's own `paramMeta.urlParams` is a DIFFERENT (frozen) array —
    // the cache entry is `collectUrlParamsArray`'s fresh copy
    isTheTreeNodesUrlParams: p1 === nodeUrlParams,
    treeNodeUrlParamsFrozen: Object.isFrozen(nodeUrlParams),
    missingRouteArm: port.pathNames("nope"),
    homeValue: [...(port.pathNames("home") ?? [])],
    homeFrozen: Object.isFrozen(port.pathNames("home")),
  };

  // 2. controls — the strict slot comparison reads the registry
  const sA = api.makeState("u", { id: "1", extra: "a" } as never);
  const sB = api.makeState("u", { id: "1", extra: "b" } as never);
  const sC = api.makeState("u", { id: "2", extra: "a" } as never);
  const controls: Record<string, unknown> = {
    areStatesEqual_idDiffers: router.areStatesEqual(sA, sC),
    areStatesEqual_extraDiffers: router.areStatesEqual(sA, sB),
  };
  await router.navigate("u", { id: "1", extra: "a" } as never);
  // exact arm: `areStatesEqual(pending, active, true)` over the SLOT registry,
  // then `locationParamsMatch` over the caller's keys. A link that omits the
  // undeclared `extra` is active today; once `extra` is a "slot" it is not.
  controls.isActiveRoute_exact_linkOmitsExtra = router.isActiveRoute(
    "u",
    { id: "1" } as never,
    undefined,
    true,
  );
  controls.isActiveRoute_exact_idDiffers = router.isActiveRoute(
    "u",
    { id: "2" } as never,
    undefined,
    true,
  );
  // NOT a consumer: `isSameNavigation` compares `state.path` strings
  controls.navigate_sameSlots_extraDiffers_pathCompare = await tryAsync(() =>
    router.navigate("u", { id: "1", extra: "b" } as never),
  );
  controls.stateExtraAfter = (router.getState()?.params as AnyRec).extra;
  out.controls_cleanRegistry = controls;

  // 3. injection through the handout, same calls
  out.injection = {
    pushThroughHandout: tryRun(() => (p1 as string[]).push("extra")),
    afterPush: [...(port.pathNames("u") ?? [])],
  };
  const after: Record<string, unknown> = {
    areStatesEqual_idDiffers: router.areStatesEqual(sA, sC),
    areStatesEqual_extraDiffers: router.areStatesEqual(sA, sB),
    isActiveRoute_exact_linkOmitsExtra: router.isActiveRoute(
      "u",
      { id: "1" } as never,
      undefined,
      true,
    ),
    isActiveRoute_exact_idDiffers: router.isActiveRoute(
      "u",
      { id: "2" } as never,
      undefined,
      true,
    ),
  };
  after.navigate_sameSlots_extraDiffers_pathCompare = await tryAsync(() =>
    router.navigate("u", { id: "1", extra: "b" } as never),
  );
  after.stateExtraAfter = (router.getState()?.params as AnyRec).extra;
  out.after_injection = after;

  // 4. lifecycle — cleared on rebuild
  routes.add({ name: "z", path: "/z" } as never);
  const p3 = port.pathNames("u");
  out.lifecycle = {
    add_newArray: p3 !== p1,
    add_value: p3 === undefined ? undefined : [...p3],
    add_frozen: p3 === undefined ? undefined : Object.isFrozen(p3),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
