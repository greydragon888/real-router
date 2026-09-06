// Triage batch: does core READ BACK the handed-out tree / registry arrays after
// the caller could have mutated them? Positive controls included.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

// ---------- A. tree handout round-trip (children Map) ----------
{
  const r = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id" },
    ] as never,
    {} as never,
  );
  const api = getPluginApi(r);
  const routes = getRoutesApi(r) as any;
  const int = getInternals(r) as any;
  const tree = api.getTree() as any;
  out.A_sameObject_pluginApi_vs_internals = tree === int.getTree();
  out.A_sameObject_vs_storeTree = tree === (int.routeGetStore() as any).tree;
  out.A_rootFrozen = Object.isFrozen(tree);
  out.A_childrenIsMap = tree.children instanceof Map;
  out.A_childrenFrozenAsObject = Object.isFrozen(tree.children);

  // POSITIVE CONTROL: a legal add is visible to the matcher.
  out.A_ctl_hasBefore = routes.has("legal");
  routes.add([{ name: "legal", path: "/legal" }] as never);
  out.A_ctl_hasAfter = routes.has("legal");

  // The write core cannot refuse: Map internal slot. Re-fetch: the control add
  // rebuilt the tree, so the live object is a different one.
  const live = api.getTree() as any;
  out.A_treeIdentityChangedOnRebuild = live !== tree;
  const home = live.children.get("home");
  const fake = { ...home, name: "__inj__", fullName: "__inj__", path: "/inj" };
  let setVerdict = "no-throw";
  try {
    live.children.set("__inj__", fake);
  } catch (e) {
    setVerdict = "throw:" + (e as Error).name;
  }
  out.A_childrenSetVerdict = setVerdict;
  out.A_hasRoute_beforeRebuild = routes.has("__inj__");
  // WHERE core reads it back: routesStore `get definitions()` → routeTreeToDefinitions(store.tree)
  out.A_definitionsCarryIt = (int.routeGetStore() as any).definitions.some(
    (d: any) => d.name === "__inj__",
  );
  routes.add([{ name: "spare", path: "/spare" }] as never); // any rebuild
  out.A_hasRoute_afterRebuild = routes.has("__inj__");
  try {
    out.A_buildPath_injected = r.buildPath("__inj__", {} as never);
  } catch (e) {
    out.A_buildPath_injected = "throw:" + (e as Error).message;
  }
}

// ---------- B. registry array round-trip (declared query params) ----------
{
  const r = createRouter([{ name: "q", path: "/q/:id?tab" }] as never, {} as never);
  const int = getInternals(r) as any;
  // POSITIVE CONTROL: an undeclared query key is refused today.
  let ctl = "no-throw";
  try {
    r.buildPath("q", { id: "1" } as never, { nope: "1" } as never);
  } catch {
    ctl = "throw";
  }
  out.B_ctl_undeclaredSearchRefused = ctl;

  const arr = int.getQueryParams("q") as string[];
  out.B_arrayFrozen = Object.isFrozen(arr);
  out.B_sameObjectAcrossCalls = arr === int.getQueryParams("q");
  out.B_sameObjectViaPort = arr === int.port().queryNames("q");
  const path = int.port().pathNames("q") as string[];
  out.B_pathNamesFrozen = Object.isFrozen(path);
  out.B_matcherDeclaredFrozen = Object.isFrozen(
    int.routeGetStore().matcher.getDeclaredQueryParams("q"),
  );

  arr.push("nope"); // caller writes into core's cached registry
  let after = "no-throw";
  try {
    r.buildPath("q", { id: "1" } as never, { nope: "1" } as never);
  } catch {
    after = "throw";
  }
  out.B_afterPush_undeclaredSearchAccepted = after;
}

// ---------- C. meta handout: frozen, no round-trip surface ----------
{
  const r = createRouter([{ name: "u", path: "/u/:id" }] as never, {} as never);
  const int = getInternals(r) as any;
  const meta = int.getMetaForState("u");
  out.C_metaFrozen = Object.isFrozen(meta);
  out.C_leafFrozen = Object.isFrozen(meta.u);
  out.C_sameAcrossCalls = meta === int.getMetaForState("u");
  let w = "no-throw";
  try {
    meta.evil = {};
  } catch (e) {
    w = "throw:" + (e as Error).name;
  }
  out.C_writeTop = w;
  let w2 = "no-throw";
  try {
    meta.u.evil = "url";
  } catch (e) {
    w2 = "throw:" + (e as Error).name;
  }
  out.C_writeLeaf = w2;
}

console.log(JSON.stringify(out, null, 1));
