// Census-completeness probe: which RouterValidator callbacks receive the
// CALLER's own container by identity (before / beside core's copy)?
// A recording validator is installed on `getInternals(router).validator` — the
// same slot validation-plugin writes — and every public door is called with a
// marker object. `same: true` = the plugin was handed the caller's object.
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Call = { m: string; args: unknown[] };
const calls: Call[] = [];
const group = (g: string) =>
  new Proxy(
    {},
    {
      get:
        (_t, m) =>
        (...args: unknown[]) => {
          calls.push({ m: `${g}.${String(m)}`, args });
        },
    },
  );
const recorder = new Proxy({}, { get: (_t, g) => group(String(g)) });

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b/:id?q" },
  { name: "c", path: "/c", decodeParams: (ch: unknown) => ch },
];

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  const ctx = getInternals(router);
  const api = getPluginApi(router);
  const routesApi = getRoutesApi(router);
  const lifecycle = getLifecycleApi(router);
  const depsApi = getDependenciesApi(router);

  await router.start("/a");

  // NEGATIVE CONTROL: validator null → nothing recorded.
  router.buildPath("b", { id: "1" }, { q: "x" });
  const recordedWithoutValidator = calls.length;

  ctx.validator = recorder as never;

  const P = { id: "1" };
  const S = { q: "x" };
  const O = { replace: true };
  const S1 = router.getState()!;
  const S2 = api.makeState("a", {}, {});
  const ST = api.makeState("b", { id: "9" }, { q: "z" });
  const U = { defaultParams: { id: "2" } };
  const R = { name: "r", path: "/r", defaultParams: { k: "v" } };
  const D = { svc: {} };
  const V = { leaf: true };
  const F = () => () => true;
  const CB = () => {};
  const pluginObj = { onStart: () => {} };
  const factory = () => pluginObj;

  const hits = (m: string, obj: unknown) =>
    calls.filter((c) => c.m === m && c.args.includes(obj)).length;
  const marks: Record<string, unknown>[] = [];
  const check = (door: string, m: string, obj: unknown, label: string) => {
    marks.push({ door, method: m, arg: label, same: hits(m, obj) > 0, count: hits(m, obj) });
  };

  calls.length = 0;
  router.isActiveRoute("b", P, S, false, false);
  check("Router.isActiveRoute·params", "routes.validateIsActiveRouteArgs", P, "P");
  check("Router.isActiveRoute·search", "navigation.validateSearch", S, "S");

  calls.length = 0;
  router.buildPath("b", P, S);
  check("Router.buildPath·params", "navigation.validateParams", P, "P");
  check("Router.buildPath·search", "navigation.validateSearch", S, "S");

  calls.length = 0;
  router.canNavigateTo("b", P, S);
  check("Router.canNavigateTo·params", "navigation.validateParams", P, "P");
  check("Router.canNavigateTo·search", "navigation.validateSearch", S, "S");

  calls.length = 0;
  await router.navigate("b", P, S, O).catch(() => undefined);
  check("Router.navigate·routeParams", "navigation.validateParams", P, "P");
  check("Router.navigate·routeParams (2nd reader)", "routes.validateStateBuilderArgs", P, "P");
  check("Router.navigate·routeSearch", "navigation.validateSearch", S, "S");
  check("Router.navigate·options", "navigation.validateNavigationOptions", O, "O");

  calls.length = 0;
  await router.navigate({ name: "a", params: {}, search: S }, O).catch(() => undefined);
  check("Router.navigate·target.search", "navigation.validateSearch", S, "S");
  check("Router.navigate·target·options", "navigation.validateNavigationOptions", O, "O");

  calls.length = 0;
  await router.navigateToDefault(O).catch(() => undefined);
  check("Router.navigateToDefault·options", "navigation.validateNavigateToDefaultArgs", O, "O");
  check("Router.navigateToDefault·options (2nd reader)", "navigation.validateNavigationOptions", O, "O");

  calls.length = 0;
  router.areStatesEqual(S1, S2);
  check("Router.areStatesEqual·state1", "state.validateAreStatesEqualArgs", S1, "S1");
  check("Router.areStatesEqual·state2", "state.validateAreStatesEqualArgs", S2, "S2");

  calls.length = 0;
  api.makeState("b", P, S);
  check("PluginApi.makeState·params", "state.validateMakeStateArgs", P, "P");
  check("PluginApi.makeState·search", "navigation.validateSearch", S, "S");

  calls.length = 0;
  api.forwardState("b", P, S);
  check("PluginApi.forwardState·routeParams", "routes.validateStateBuilderArgs", P, "P");
  check("PluginApi.forwardState·routeSearch", "navigation.validateSearch", S, "S");

  calls.length = 0;
  await api.navigateToState(ST, O).catch(() => undefined);
  check("PluginApi.navigateToState·state", "navigation.validateNavigateToStateArgs", ST, "ST");
  check("PluginApi.navigateToState·options", "navigation.validateNavigationOptions", O, "O");

  calls.length = 0;
  api.buildNavigationState("b", P, S);
  check("PluginApi.buildNavigationState·params", "routes.validateStateBuilderArgs", P, "P");
  check("PluginApi.buildNavigationState·search", "navigation.validateSearch", S, "S");

  calls.length = 0;
  const off = api.addEventListener("$$success", CB);
  off();
  check("PluginApi.addEventListener·cb", "eventBus.validateListenerArgs", CB, "CB (fn leaf)");

  calls.length = 0;
  routesApi.update("b", U as never);
  check("RoutesApi.update·updates", "routes.validateUpdateRouteBasicArgs", U, "U");
  check("RoutesApi.update·updates (2nd reader)", "routes.validateUpdateRoutePropertyTypes", U, "U");
  check("RoutesApi.update·updates (3rd reader)", "routes.validateUpdateRoute", U, "U");

  calls.length = 0;
  const arr = [R];
  routesApi.add(arr as never);
  const vr = calls.find((c) => c.m === "routes.validateRoutes");
  const batch = vr?.args[0] as unknown[] | undefined;
  marks.push({
    door: "RoutesApi.add·routes[] (validateRoutes gets SNAPSHOT, not caller array)",
    method: "routes.validateRoutes",
    batchIsCallerArray: batch === arr,
    batchElementIsCallerRoute: batch?.[0] === R,
    nestedDefaultParamsIsCallers:
      (batch?.[0] as { defaultParams?: unknown } | undefined)?.defaultParams === R.defaultParams,
  });
  const grc = calls.find((c) => c.m === "routes.guardRouteCallbacks");
  marks.push({
    door: "guardRouteCallbacks·route (snapshot element)",
    method: "routes.guardRouteCallbacks",
    isCallerRoute: grc?.args[0] === R,
    nestedDefaultParamsIsCallers:
      (grc?.args[0] as { defaultParams?: unknown } | undefined)?.defaultParams === R.defaultParams,
  });

  calls.length = 0;
  depsApi.setAll(D as never);
  check("DependenciesApi.setAll·deps (CENSUSED control)", "dependencies.validateDependenciesObject", D, "D");

  calls.length = 0;
  depsApi.set("leafy" as never, V as never);
  check("DependenciesApi.set·value", "dependencies.validateSetDependencyArgs", V, "V (leaf)");

  calls.length = 0;
  cloneRouter(router, D as never);
  check("cloneRouter·dependencies (CENSUSED control)", "dependencies.validateCloneArgs", D, "D");

  calls.length = 0;
  lifecycle.addActivateGuard("a", F as never);
  check("LifecycleApi.addActivateGuard·handler", "lifecycle.validateHandler", F, "F (fn leaf)");

  calls.length = 0;
  const offPlugin = router.usePlugin(factory as never);
  check("Router.usePlugin·factory (CENSUSED control)", "plugins.validateNoDuplicatePlugins", factory, "factory");
  check("Router.usePlugin·PluginFactory·return (plugin object → validatePluginKeys)", "plugins.validatePluginKeys", pluginObj, "pluginObj");
  offPlugin();

  // decodeParams return handed to the validator by identity (matchPath)
  const decoded = { params: {}, search: {} };
  routesApi.update("c", { decodeParams: () => decoded } as never);
  calls.length = 0;
  api.matchPath("/c");
  check("Route.decodeParams·return → validateStateBuilderArgs(decoded.params)", "routes.validateStateBuilderArgs", decoded.params, "decoded.params");

  const out = {
    recordedWithoutValidator,
    totalRecordedWithValidator: marks.length,
    marks,
  };

  console.log(JSON.stringify(out, null, 1));
}

void main();
