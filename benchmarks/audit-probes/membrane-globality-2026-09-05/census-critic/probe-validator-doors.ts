// Census-critic probe 1: which RouterValidator callback members receive an
// OBJECT built by the caller (or a live core handout) at a core call site —
// the numerator against the interface's 54 members and against the census's
// 5 listed validator doors.
//
// Instrument: `getInternals(router).validator` is assignable (a listed door);
// a recording validator whose every member is a no-op that logs its args.
// Every caller object is tagged by identity BEFORE the call, so a hit means
// the validator was handed the caller's own object (identity) or a core
// container carrying it one level down (nested — the route snapshot case).
//
// Positive control: `dependencies.validateDependenciesObject·deps` (listed in
// the census) must register as an identity hit, run by the same recorder.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-validator-doors.ts
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

interface Hit {
  member: string;
  argIndex: number;
  label: string;
  how: "identity" | "nested";
}

const hits: Hit[] = [];
const objectArgMembers = new Map<string, Set<number>>();
const labels = new WeakMap<object, string>();

function tag<T extends object>(label: string, obj: T): T {
  labels.set(obj, label);

  return obj;
}

function isObj(v: unknown): v is object {
  return (v !== null && typeof v === "object") || typeof v === "function";
}

function scan(member: string, args: unknown[]): void {
  args.forEach((arg, i) => {
    if (!isObj(arg)) {
      return;
    }

    let set = objectArgMembers.get(member);

    if (!set) {
      set = new Set();
      objectArgMembers.set(member, set);
    }

    set.add(i);

    const direct = labels.get(arg);

    if (direct !== undefined) {
      hits.push({ member, argIndex: i, label: direct, how: "identity" });

      return;
    }

    // One level down: a route snapshot (core's `{ ...route }`) still carries the
    // caller's defaultParams / defaultSearch by reference; an array of those,
    // two levels. Never descend INTO a tagged object (it may be an accessor bag).
    const nested: unknown[] = Array.isArray(arg)
      ? arg.flatMap((e) =>
          isObj(e) && labels.get(e) === undefined
            ? [e, ...Object.values(e)]
            : [e],
        )
      : Object.values(arg);

    for (const n of nested) {
      if (isObj(n)) {
        const l = labels.get(n);

        if (l !== undefined) {
          hits.push({ member, argIndex: i, label: l, how: "nested" });
        }
      }
    }
  });
}

function group(name: string): unknown {
  return new Proxy(
    {},
    {
      get: (_t, member) =>
        typeof member === "string"
          ? (...args: unknown[]): void => {
              scan(`${name}.${member}`, args);
            }
          : undefined,
    },
  );
}

const recorder = {
  routes: group("routes"),
  options: group("options"),
  dependencies: group("dependencies"),
  plugins: group("plugins"),
  lifecycle: group("lifecycle"),
  navigation: group("navigation"),
  state: group("state"),
  eventBus: group("eventBus"),
};

const P = (l: string): object => tag(l, { id: "1" });
const S = (l: string): object => tag(l, { tab: "x" });

async function main(): Promise<void> {
  const DP = tag("createRouter.route.defaultParams", { id: "9" });
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab", defaultParams: DP },
    ] as never,
    { defaultRoute: () => "home" } as never,
    { svc: {} } as never,
  );
  const ctx = getInternals(router);

  ctx.validator = recorder as never;

  await router.start("/home");

  router.buildPath("u", P("buildPath.params") as never, S("buildPath.search") as never);
  router.isActiveRoute(
    "u",
    P("isActiveRoute.params") as never,
    S("isActiveRoute.search") as never,
  );
  router.canNavigateTo(
    "u",
    P("canNavigateTo.params") as never,
    S("canNavigateTo.search") as never,
  );
  await router.navigate(
    "u",
    P("navigate.params") as never,
    S("navigate.search") as never,
    tag("navigate.options", { replace: true }) as never,
  );
  await router.navigate(
    tag("navigate.target", {
      name: "u",
      params: P("navigate.target.params"),
      search: S("navigate.target.search"),
    }) as never,
    tag("navigate.options(descriptor form)", { reload: true }) as never,
  );
  await router.navigateToDefault(
    tag("navigateToDefault.options", { replace: true }) as never,
  );
  router.areStatesEqual(
    tag("areStatesEqual.state1", { ...router.getState()! }) as never,
    tag("areStatesEqual.state2(core getState)", router.getState()!) as never,
  );
  router.usePlugin(tag("usePlugin.factory", () => ({})) as never);

  const api = getPluginApi(router);

  api.makeState("u", P("makeState.params") as never, S("makeState.search") as never);
  api.forwardState(
    "u",
    P("forwardState.params") as never,
    S("forwardState.search") as never,
  );
  await api.navigateToState(
    tag("navigateToState.state", api.makeState("u", { id: "3" }, { tab: "y" })),
    tag("navigateToState.options", { replace: true }) as never,
  );
  api.buildNavigationState(
    "u",
    P("buildNavigationState.params") as never,
    S("buildNavigationState.search") as never,
  );
  api.addEventListener("$$success", tag("addEventListener.cb", () => {}) as never);

  const routesApi = getRoutesApi(router);

  routesApi.add(
    [
      tag("add.route", {
        name: "n1",
        path: "/n1",
        defaultParams: tag("add.route.defaultParams", { z: "1" }),
        defaultSearch: tag("add.route.defaultSearch", { q: "1" }),
      }),
    ] as never,
    tag("add.options", {}) as never,
  );
  routesApi.add(
    tag("add.route(single, with parent)", { name: "n2", path: "/n2" }) as never,
    tag("add.options(parent)", { parent: "n1" }) as never,
  );
  routesApi.update(
    "n1",
    tag("update.updates", {
      defaultParams: tag("update.updates.defaultParams", { z: "2" }),
    }) as never,
  );
  routesApi.replace([
    tag("replace.route(home)", { name: "home", path: "/home" }),
    tag("replace.route(u)", {
      name: "u",
      path: "/u/:id?tab",
      defaultParams: tag("replace.route.defaultParams", { id: "8" }),
    }),
  ] as never);

  const depsApi = getDependenciesApi(router);

  depsApi.set("k" as never, tag("set.value", { leaf: true }) as never);
  depsApi.setAll(
    tag("setAll.deps", { m: tag("setAll.deps.m", {}) }) as never,
  );
  depsApi.get("k" as never);

  getLifecycleApi(router).addActivateGuard(
    "u",
    tag("addActivateGuard.handler", () => () => true) as never,
  );
  cloneRouter(router, tag("cloneRouter.dependencies", { c: {} }) as never);

  const membersWithObjectArgs = [...objectArgMembers.entries()]
    .map(([m, idx]) => `${m}·arg${[...idx].sort().join(",")}`)
    .sort();
  const membersHitByCallerObject = [...new Set(hits.map((h) => h.member))].sort();

  const CENSUS_LISTED = [
    "plugins.validateNoDuplicatePlugins",
    "dependencies.validateDependencyCount",
    "dependencies.validateDependencyExists",
    "dependencies.validateDependenciesObject",
    "dependencies.validateCloneArgs",
  ];
  const missing = membersWithObjectArgs.filter(
    (m) => !CENSUS_LISTED.some((c) => m.startsWith(`${c}·`)),
  );

  console.log(
    JSON.stringify(
      {
        interfaceMembersTotal: 54,
        membersReceivingObjectArg_count: objectArgMembers.size,
        membersReceivingObjectArg: membersWithObjectArgs,
        membersHitByTaggedCallerObject_count: membersHitByCallerObject.length,
        control_listedDoor_validateDependenciesObject_identityHit: hits.some(
          (h) =>
            h.member === "dependencies.validateDependenciesObject" &&
            h.how === "identity" &&
            h.label === "setAll.deps",
        ),
        censusListed: CENSUS_LISTED,
        notInCensus_count: missing.length,
        notInCensus: missing,
        hits,
      },
      null,
      2,
    ),
  );

  // ---- update·updates: read count across validator + commit, and drift ----
  const mkValidator = (readsPatch: boolean): unknown => ({
    ...recorder,
    routes: new Proxy(
      {},
      {
        get: (_t, member) =>
          typeof member === "string"
            ? (...args: unknown[]): void => {
                if (
                  readsPatch &&
                  (member === "validateUpdateRouteBasicArgs" ||
                    member === "validateUpdateRoutePropertyTypes" ||
                    member === "validateUpdateRoute")
                ) {
                  // What the real plugin does: reads the patch's declared keys
                  // (validators/routes.ts · validateUpdateRoutePropertyTypes
                  // destructures defaultParams / defaultSearch / …).
                  void (args[1] as { defaultParams?: unknown }).defaultParams;
                }
              }
            : undefined,
      },
    ),
  });

  const r2 = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const ctx2 = getInternals(r2);
  const api2 = getRoutesApi(r2);

  // control: no validator — commit alone
  const c0 = countingBag({ defaultParams: { id: "5" } });

  api2.update("u", c0.bag as never);

  const readsWithoutValidator = { ...c0.reads };

  ctx2.validator = mkValidator(true) as never;

  const c1 = countingBag({ defaultParams: { id: "6" } });

  api2.update("u", c1.bag as never);

  const readsWithValidator = { ...c1.reads };

  // drift: validator sees A, commit gets B
  const A = { id: "A" };
  const B = { id: "B" };
  const d = driftingBag({ defaultParams: A }, { defaultParams: B });

  api2.update("u", d.bag as never);

  const committed = ctx2.port().defaultParams("u");

  console.log(
    JSON.stringify(
      {
        update_updates_reads_defaultParams: {
          control_noValidator: readsWithoutValidator,
          withValidatorReadingPatch: readsWithValidator,
        },
        update_updates_drift: {
          committedIsB: committed === B,
          committedIsA: committed === A,
          readsOnDriftingPatch: d.reads,
        },
      },
      null,
      2,
    ),
  );
}

void main();
