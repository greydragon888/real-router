// Door: RouterInternals.getQueryParams·return ≡ RouteResolver.queryNames·return
// (ONE reference — the `store.queryParamsCache` entry filled by
// `RoutesNamespace/helpers.ts · queryParamsFor`). The type says `readonly
// string[]`; this probe asks what the RUNTIME hands out, who classifies through
// it, and whether a freeze at the source would break anything (COULD-(а) test).
//
// Every cell has a POSITIVE CONTROL: the same call on the clean registry, and
// a proof the input reached the branch (the control outcome differs from the
// post-injection outcome on the same input).
import { createRouter } from "@real-router/core";
import * as coreRoot from "@real-router/core";
import * as coreApi from "@real-router/core/api";
import * as coreUtils from "@real-router/core/utils";
import * as coreValidation from "@real-router/core/validation";
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
    const err = error as {
      code?: string;
      message?: string;
      constructor: { name: string };
    };
    const site = /\[router\.([A-Za-z]+)\]/.exec(String(err.message))?.[1];
    return `reject:${err.code ?? err.constructor.name}${site ? `@${site}` : ""}`;
  }
};
const siteOf = (fn: () => unknown): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    const err = error as Error;
    const site = /\[router\.([A-Za-z]+)\]/.exec(err.message)?.[1];
    return `throw:${err.constructor.name}${site ? `@${site}` : ""}`;
  }
};

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
  { name: "fwd", path: "/fwd/:id", forwardTo: "u" },
  {
    name: "dec",
    path: "/dec/:id?q",
    // A decoder that moves a NON-declared key into params: legal today.
    decodeParams: (ch: { params: AnyRec; search: AnyRec }) => ({
      params: { ...ch.params, __injected__: "x" },
      search: ch.search,
    }),
  },
] as never;

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // ---------------------------------------------------------------------------
  // 0. REACH — which subpaths export the namespace / the deps closures? (none)
  // ---------------------------------------------------------------------------
  out.reach = {
    rootExports: Object.keys(coreRoot).sort(),
    apiExports: Object.keys(coreApi).sort(),
    utilsExports: Object.keys(coreUtils).sort(),
    validationExports: Object.keys(coreValidation).sort(),
  };

  const router = createRouter(ROUTES, { defaultRoute: "home" } as never);
  const ctx = getInternals(router);
  const api = getPluginApi(router);
  const routes = getRoutesApi(router);
  const port = ctx.port();
  await router.start("/home");

  // ---------------------------------------------------------------------------
  // 1. IDENTITY / FROZENNESS of the handout
  // ---------------------------------------------------------------------------
  const q1 = ctx.getQueryParams("u");
  const q2 = ctx.getQueryParams("u");
  const engine = ctx.routeGetStore().matcher.getDeclaredQueryParams("u");
  out.handout = {
    value: [...q1],
    sameArrayAcrossCalls: q1 === q2,
    sameArrayAsPortQueryNames: q1 === port.queryNames("u"),
    isFrozen: Object.isFrozen(q1),
    isArray: Array.isArray(q1),
    // the ENGINE's own registry (reached through the known door routeGetStore·return)
    engineArrayIsTheHandout: engine === q1,
    engineArrayFrozen:
      engine === undefined ? undefined : Object.isFrozen(engine),
    engineValue: engine === undefined ? undefined : [...engine],
    // a route with NO declarations: fresh `[]` per name, cached, unfrozen
    homeValue: [...ctx.getQueryParams("home")],
    homeSameAcrossCalls:
      ctx.getQueryParams("home") === ctx.getQueryParams("home"),
    homeFrozen: Object.isFrozen(ctx.getQueryParams("home")),
    // a route that does not exist: `[]` too (no `undefined` arm by design)
    missingValue: [...ctx.getQueryParams("nope")],
  };

  // ---------------------------------------------------------------------------
  // 2. CONTROLS on the clean registry — every consumer, same inputs
  // ---------------------------------------------------------------------------
  const badBag = { id: "1", __injected__: "x" };
  const stateWithInjected = api.makeState("u", { ...badBag } as never);
  const controls: Record<string, unknown> = {};
  controls.P1_navigate = await tryAsync(() =>
    router.navigate("u", { ...badBag } as never),
  );
  await router.navigate("home");
  controls.canNavigateTo = router.canNavigateTo("u", { ...badBag } as never);
  controls.buildNavigationState = siteOf(() =>
    api.buildNavigationState("u", { ...badBag } as never),
  );
  controls.makeState = siteOf(() => api.makeState("u", { ...badBag } as never));
  controls.P3_navigateToState = await tryAsync(() =>
    api.navigateToState(stateWithInjected),
  );
  await router.navigate("home");
  controls.forwardStateSeam = await tryAsync(() =>
    router.navigate("fwd", { ...badBag } as never),
  );
  await router.navigate("home");
  controls.matchPath_decodeParams = siteOf(() => api.matchPath("/dec/1"));
  controls.updateRoute_defaultParams = siteOf(() =>
    routes.update("u", { defaultParams: { __injected__: "d" } } as never),
  );
  routes.update("u", { defaultParams: null } as never);
  // the MODE GATE — a key declared nowhere is DROPPED from state.search (#1575)
  const s0 = await router.navigate("u", { id: "1" } as never, {
    tab: "x",
    __injected__: "x",
  } as never);
  controls.modeGate = {
    path: s0.path,
    search: { ...(s0.search as AnyRec) },
    searchKeys: Object.keys(s0.search as AnyRec),
    pathKeysFromMatch: Object.keys(api.matchPath(s0.path)?.search ?? {}),
  };
  await router.navigate("home");
  out.controls_cleanRegistry = controls;

  // ---------------------------------------------------------------------------
  // 3. INJECTION through the handout, then the SAME calls
  // ---------------------------------------------------------------------------
  out.injection = {
    pushThroughHandout: tryRun(() => (q1 as string[]).push("__injected__")),
    afterPush: [...ctx.getQueryParams("u")],
    portSeesIt: [...port.queryNames("u")],
    engineStillClean: engine === undefined ? undefined : [...engine],
  };
  const after: Record<string, unknown> = {};
  after.P1_navigate = await tryAsync(() =>
    router.navigate("u", { ...badBag } as never),
  );
  after.canNavigateTo = router.canNavigateTo("u", { ...badBag } as never);
  after.buildNavigationState = siteOf(() =>
    api.buildNavigationState("u", { ...badBag } as never),
  );
  after.makeState = siteOf(() => api.makeState("u", { ...badBag } as never));
  after.P3_navigateToState = await tryAsync(() =>
    api.navigateToState(stateWithInjected),
  );
  after.forwardStateSeam = await tryAsync(() =>
    router.navigate("fwd", { ...badBag } as never),
  );
  // the decoder route has its OWN registry entry — inject there too
  (ctx.getQueryParams("dec") as string[]).push("__injected__");
  after.matchPath_decodeParams = siteOf(() => api.matchPath("/dec/1"));
  after.updateRoute_defaultParams = siteOf(() =>
    routes.update("u", { defaultParams: { __injected__: "d" } } as never),
  );
  // the MODE GATE now ADMITS the key — while the URL build (engine registry) does not print it
  const s1 = await router.navigate("u", { id: "1" } as never, {
    tab: "x",
    __injected__: "x",
  } as never);
  const pathKeys1 = Object.keys(api.matchPath(s1.path)?.search ?? {});
  after.modeGate = {
    path: s1.path,
    search: { ...(s1.search as AnyRec) },
    searchKeys: Object.keys(s1.search as AnyRec),
    pathKeysFromMatch: pathKeys1,
    invariant_searchKeys_subset_of_pathKeys: Object.keys(
      s1.search as AnyRec,
    ).every((k) => pathKeys1.includes(k)),
  };
  await router.navigate("home");
  out.after_injection = after;

  // ---------------------------------------------------------------------------
  // 4. withholdFilledSlots — the third mechanism, observable under `loose`
  // ---------------------------------------------------------------------------
  {
    const r = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "u",
          path: "/u/:id?tab",
          defaultSearch: { __injected__: "dflt" },
        },
      ] as never,
      { defaultRoute: "home", queryParamsMode: "loose" } as never,
    );
    const c = getInternals(r);
    const before = r.buildPath("u", { id: "1", __injected__: "caller" } as never);
    (c.getQueryParams("u") as string[]).push("__injected__");
    const afterInj = r.buildPath("u", {
      id: "1",
      __injected__: "caller",
    } as never);
    out.withholdFilledSlots_loose = {
      control_defaultApplied: before,
      afterInjection_defaultWithheld: afterInj,
      differs: before !== afterInj,
    };
  }

  // ---------------------------------------------------------------------------
  // 4b. THE MODE GATE under `queryParamsMode: "default"` (the repo default is
  //     `loose`, where the gate is skipped — the cells in §2/§3 above are that
  //     loose-mode control). Here the gate RUNS: an undeclared key is dropped
  //     from `state.search` (#1575) — until the registry handout says it is
  //     declared, while the URL build (the engine's own registry) still does
  //     not print it: `keys(state.search) ⊄ keys(matchPath(state.path).search)`.
  // ---------------------------------------------------------------------------
  {
    const r = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "u", path: "/u/:id?tab" },
      ] as never,
      { defaultRoute: "home", queryParamsMode: "default" } as never,
    );
    const c = getInternals(r);
    const a = getPluginApi(r);
    await r.start("/home");
    const snap = (s: { path: string; search: unknown }): AnyRec => {
      const pathKeys = Object.keys(a.matchPath(s.path)?.search ?? {});
      const searchKeys = Object.keys(s.search as AnyRec);
      return {
        path: s.path,
        search: { ...(s.search as AnyRec) },
        pathKeysFromMatch: pathKeys,
        invariant_searchKeys_subset_of_pathKeys: searchKeys.every((k) =>
          pathKeys.includes(k),
        ),
      };
    };
    const ctrl = await r.navigate("u", { id: "1" } as never, {
      tab: "x",
      __injected__: "x",
    } as never);
    await r.navigate("home");
    (c.getQueryParams("u") as string[]).push("__injected__");
    const steered = await r.navigate("u", { id: "1" } as never, {
      tab: "x",
      __injected__: "x",
    } as never);
    out.modeGate_defaultMode = {
      control_keyDropped: snap(ctrl),
      afterInjection_keyAdmitted: snap(steered),
      buildPath_afterInjection: r.buildPath("u", { id: "1" } as never, {
        tab: "x",
        __injected__: "x",
      } as never),
    };
  }

  // ---------------------------------------------------------------------------
  // 5. LIFECYCLE — the poison lives until the next matcher rebuild
  // ---------------------------------------------------------------------------
  const beforeRebuild = ctx.getQueryParams("u");
  ctx.setRootPath("?lang");
  const afterRoot = ctx.getQueryParams("u");
  routes.add({ name: "z", path: "/z" } as never);
  const afterAdd = ctx.getQueryParams("u");
  out.lifecycle = {
    setRootPath_newArray: afterRoot !== beforeRebuild,
    setRootPath_value: [...afterRoot],
    add_newArray: afterAdd !== afterRoot,
    add_value: [...afterAdd],
    add_frozen: Object.isFrozen(afterAdd),
  };

  // ---------------------------------------------------------------------------
  // 6. FREEZE-AT-SOURCE BATTERY (from outside, no src edit): does anything in
  //    core write into the handed-out arrays after the cache fill? Two routers,
  //    identical inputs; on `frozen` every registry entry is frozen up front
  //    (and re-frozen after each rebuild). Outputs must be byte-identical.
  // ---------------------------------------------------------------------------
  const battery = async (
    freezeIt: boolean,
  ): Promise<Record<string, unknown>> => {
    const r = createRouter(ROUTES, { defaultRoute: "home" } as never);
    const c = getInternals(r);
    const p = c.port();
    const a = getPluginApi(r);
    const ra = getRoutesApi(r);
    const names = (): string[] => ["home", "u", "fwd", "dec", "z", "nope"];
    const freezeAll = (): void => {
      if (!freezeIt) return;
      for (const n of names()) {
        Object.freeze(c.getQueryParams(n));
        const pn = p.pathNames(n);
        if (pn !== undefined) Object.freeze(pn);
      }
    };
    freezeAll();
    const res: Record<string, unknown> = {};
    const errors: string[] = [];
    const step = async (label: string, fn: () => unknown): Promise<void> => {
      try {
        const v = await fn();
        res[label] =
          v && typeof v === "object" && "name" in (v as AnyRec)
            ? {
                name: (v as AnyRec).name,
                path: (v as AnyRec).path,
                params: (v as AnyRec).params,
                search: (v as AnyRec).search,
              }
            : v;
      } catch (error) {
        errors.push(`${label}:${(error as Error).message}`);
      }
    };
    await step("start", () => r.start("/home"));
    await step("navigate.u", () =>
      r.navigate("u", { id: "1" } as never, { tab: "x" } as never),
    );
    await step("navigate.u.same", () =>
      r.navigate("u", { id: "1" } as never, { tab: "x" } as never),
    );
    await step("navigate.fwd", () => r.navigate("fwd", { id: "2" } as never));
    await step("buildPath", () =>
      r.buildPath("u", { id: "3" } as never, { tab: "y" } as never),
    );
    await step("buildPath.twinInParams", () =>
      r.buildPath("u", { id: "3", tab: "p" } as never),
    );
    await step("matchPath", () => a.matchPath("/u/4?tab=z&extra=1"));
    await step("matchPath.dec", () => a.matchPath("/dec/5?q=1"));
    await step("isActiveRoute", () => r.isActiveRoute("u", { id: "2" } as never));
    await step("isActiveRoute.strict", () =>
      r.isActiveRoute("u", { id: "2" } as never, undefined, true),
    );
    await step("canNavigateTo", () => r.canNavigateTo("u", { id: "9" } as never));
    await step("canNavigateTo.bad", () =>
      r.canNavigateTo("u", { id: "9", tab: "t" } as never),
    );
    await step("makeState", () =>
      a.makeState("u", { id: "6" } as never, { tab: "m" } as never),
    );
    await step("buildNavigationState", () =>
      a.buildNavigationState("u", { id: "7" } as never, { tab: "n" } as never),
    );
    await step("areStatesEqual", () =>
      r.areStatesEqual(
        a.makeState("u", { id: "1", x: "a" } as never),
        a.makeState("u", { id: "1", x: "b" } as never),
      ),
    );
    await step("update.defaultParams", () =>
      ra.update("u", { defaultParams: { id: "d" } } as never),
    );
    await step("update.defaultSearch", () =>
      ra.update("u", { defaultSearch: { tab: "ds" } } as never),
    );
    await step("buildPath.afterDefaults", () => r.buildPath("u"));
    await step("add.z", () => ra.add({ name: "z", path: "/z?zz" } as never));
    freezeAll();
    await step("navigate.z", () =>
      r.navigate("z", {} as never, { zz: "1" } as never),
    );
    await step("setRootPath", () => c.setRootPath("?lang"));
    freezeAll();
    await step("navigate.u.lang", () =>
      r.navigate("u", { id: "8" } as never, { lang: "en", tab: "q" } as never),
    );
    await step("buildPath.lang", () =>
      r.buildPath("u", { id: "8" } as never, { lang: "en" } as never),
    );
    await step("remove.z", () => ra.remove("z"));
    freezeAll();
    await step("has.z", () => ra.has("z"));
    await step("navigate.home", () => r.navigate("home"));
    res.__errors = errors;
    res.__frozenNow = freezeIt
      ? ["u", "home"].map((n) => Object.isFrozen(c.getQueryParams(n)))
      : undefined;
    return res;
  };
  const control = await battery(false);
  const frozen = await battery(true);
  const cf = JSON.stringify({ ...control, __frozenNow: undefined });
  const ff = JSON.stringify({ ...frozen, __frozenNow: undefined });
  out.freezeAtSourceBattery = {
    stepsRun: Object.keys(control).length - 2,
    controlErrors: control.__errors,
    frozenErrors: frozen.__errors,
    frozenRegistryConfirmed: frozen.__frozenNow,
    identicalOutputs: cf === ff,
    ...(cf === ff ? {} : { control, frozen }),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
