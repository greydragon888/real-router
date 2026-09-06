// GAP DOOR: RouterInternals.getMetaForState·return — the route-meta record built by
// `buildMeta` (engine/path-matcher/registration/index.ts) and handed out by route
// name — and the SAME object at its other exits: `Matcher.getMetaByName·return`
// (via `routeGetStore().matcher`), `RouterInternals.buildStateResolved·return.meta`,
// `Matcher.match·return.meta`, and its LEAVES (`paramTypeMap`), which are the very
// objects `PluginApi.getTree·return` exposes on each node.
//
// Cells: identity across calls and doors · prototype · Object.isFrozen at BOTH
// levels · write attempts at both levels (strict-mode assignment, Reflect.set,
// defineProperty, delete) · the shared EMPTY_ROUTE_META sentinel (across routes AND
// routers) · the `__proto__` route name (concealUnsafeKey, #1957) · the round-trip
// discriminator: `segmentParamsEqual` (transitionPath.ts) reads this record on
// every navigation, so `transition.segments.activated` is the POSITIVE CONTROL that
// the record reached its consumer · what a CRUD rebuild does to a held handout.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Meta = Record<string, Record<string, "url" | "query">>;

const tryWrite = (fn: () => void): string => {
  try {
    fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}`;
  }
};

const protoOf = (o: object): string =>
  Object.getPrototypeOf(o) === Object.prototype
    ? "Object.prototype"
    : Object.getPrototypeOf(o) === null
      ? "null"
      : "other";

async function main(): Promise<void> {
  const routes = [
    {
      name: "u",
      path: "/u/:id?tab",
      children: [{ name: "c", path: "/c/:cid?q" }],
    },
    { name: "home", path: "/home" },
    { name: "s1", path: "/s1" },
    { name: "s2", path: "/s2" },
    { name: "__proto__", path: "/p/:pid" },
  ] as never;
  const router = createRouter(routes, {} as never);
  const ctx = getInternals(router);
  const plugin = getPluginApi(router);
  const matcher = ctx.routeGetStore().matcher;
  const out: Record<string, unknown> = {};

  const m = ctx.getMetaForState("u.c") as Meta;
  const tree = plugin.getTree();
  const nodeU = tree.children.get("u")!;
  const nodeUC = nodeU.children.get("c")!;
  const resolved = ctx.buildStateResolved("u.c", { id: "1", cid: "2" });
  const matched = matcher.match("/u/1/c/2");

  // --- 1. one object, five exits
  out.identity = {
    sameAcrossCalls: m === ctx.getMetaForState("u.c"),
    sameAs_Matcher_getMetaByName: m === matcher.getMetaByName("u.c"),
    sameAs_buildStateResolved_meta: m === resolved?.meta,
    sameAs_Matcher_match_meta: m === matched?.meta,
    leaf_u_isTreeNode_paramTypeMap: m.u === nodeU.paramTypeMap,
    leaf_uc_isTreeNode_paramTypeMap: m["u.c"] === nodeUC.paramTypeMap,
    leaf_u_sharedWithParentRouteMeta:
      m.u === (ctx.getMetaForState("u") as Meta).u,
    parentAndChildRecordsDistinct: m !== ctx.getMetaForState("u"),
  };

  // --- 2. shape at both levels
  out.shape = {
    outerProto: protoOf(m),
    outerKeys: Object.keys(m),
    outerFrozen: Object.isFrozen(m),
    inner: Object.fromEntries(
      Object.entries(m).map(([k, v]) => [
        k,
        { frozen: Object.isFrozen(v), proto: protoOf(v), keys: Object.keys(v) },
      ]),
    ),
  };

  // --- 3. writes through the handout, both levels
  out.writes = {
    outerAssign: tryWrite(() => {
      (m as Record<string, unknown>).zzz = {};
    }),
    outerReflectSet: Reflect.set(m, "zzz", {}),
    outerDefineProperty: tryWrite(() => {
      Object.defineProperty(m, "zzz", { value: {}, enumerable: true });
    }),
    outerDelete: tryWrite(() => {
      delete (m as Record<string, unknown>).u;
    }),
    innerAssign: tryWrite(() => {
      (m.u as Record<string, string>).zzz = "url";
    }),
    innerReflectSet: Reflect.set(m.u, "zzz", "url"),
    innerDelete: tryWrite(() => {
      delete (m.u as Record<string, string>).id;
    }),
    innerOverwriteExisting: tryWrite(() => {
      (m.u as Record<string, string>).id = "query";
    }),
    keysAfter: {
      outer: Object.keys(m),
      u: Object.keys(m.u),
      "u.c": Object.keys(m["u.c"]),
      "u.id": m.u.id,
    },
  };

  // --- 4. all-static routes: the shared frozen sentinel (EMPTY_ROUTE_META)
  const router2 = createRouter(
    [{ name: "home", path: "/home" }] as never,
    {} as never,
  );
  const home = ctx.getMetaForState("home")!;

  out.staticSentinel = {
    keys: Object.keys(home),
    frozen: Object.isFrozen(home),
    proto: protoOf(home),
    sameFor_s1: home === ctx.getMetaForState("s1"),
    sameFor_s2: home === ctx.getMetaForState("s2"),
    sameAcrossRouters: home === getInternals(router2).getMetaForState("home"),
    unknownName: ctx.getMetaForState("nope"),
    rootName: ctx.getMetaForState(""),
  };

  // --- 5. a route NAMED `__proto__` — concealUnsafeKey between publish and freeze
  const pm = ctx.getMetaForState("__proto__") as Meta;
  const assignTarget: Record<string, unknown> = {};

  Object.assign(assignTarget, pm);

  const forInTarget: Record<string, unknown> = {};

  // eslint-disable-next-line guard-for-in
  for (const k in pm) {
    forInTarget[k] = pm[k];
  }

  out.protoRouteName = {
    enumerableKeys: Object.keys(pm),
    ownNames: Object.getOwnPropertyNames(pm),
    readByKey: pm.__proto__,
    descriptorEnumerable: Object.getOwnPropertyDescriptor(pm, "__proto__")
      ?.enumerable,
    assignSwapsTarget: Object.getPrototypeOf(assignTarget) !== Object.prototype,
    forInSwapsTarget: Object.getPrototypeOf(forInTarget) !== Object.prototype,
    spreadKeys: Object.keys({ ...pm }),
    frozen: Object.isFrozen(pm),
  };

  // --- 6. ROUND-TRIP POSITIVE CONTROL: the record steers segment re-activation
  await router.start("/u/1/c/2");

  const s1 = await router.navigate("u.c", { id: "1", cid: "3" } as never);
  const s2 = await router.navigate("u.c", { id: "2", cid: "3" } as never);
  const s3 = await router.navigate(
    "u.c",
    { id: "2", cid: "3" } as never,
    { q: "z" } as never,
  );
  const s4 = await router.navigate(
    "u.c",
    { id: "2", cid: "3" } as never,
    { q: "z" } as never,
    { reload: true } as never,
  );

  out.roundTrip = {
    cidChange_activated: s1.transition?.segments.activated,
    idChange_activated: s2.transition?.segments.activated,
    queryOnlyChange_activated: s3.transition?.segments.activated,
    reload_activated: s4.transition?.segments.activated,
    recordStillTheSameObject: ctx.getMetaForState("u.c") === m,
  };

  // --- 7. CRUD rebuild: a NEW record; the held handout is untouched
  getRoutesApi(router).add({ name: "x", path: "/x/:xid" } as never);

  const after = ctx.getMetaForState("u.c") as Meta;

  out.afterRebuild = {
    newOuterRecord: after !== m,
    newInnerLeaf_u: after.u !== m.u,
    oldHandoutKeys: Object.keys(m),
    oldHandoutStillFrozen: Object.isFrozen(m),
    oldLeafStillFrozen: Object.isFrozen(m.u),
    staticSentinelSurvivesRebuild: ctx.getMetaForState("home") === home,
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
