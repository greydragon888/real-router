// Census-critic probe 4: slots of the two live-store handouts the census lists
// only partially, plus two RouterInternals hand-outs it does not list at all.
//
//  a. dependenciesGetStore().dependencies — the census lists `.limits` but not
//     the record itself: a write through it bypasses ingestDependencies and is
//     read back by getDependenciesApi().get / getAll (round-trip).
//  b. routeGetStore().config.defaultParams / .routeCustomFields /
//     .queryParamsCache — the census lists `.tree` and `.matcher.*`; these
//     slots hold the caller's bags / the same live records other listed doors
//     hand out.
//  c. RouterInternals.logger — the RouterLogger instance: not frozen, its
//     `warn` is what core calls on every operational warning, and `configure`
//     (beyond the declared RouterLogger type) writes core's logger config.
//  d. routeGetStore().matcher.registerTree / buildPath / hasRoute — public
//     matcher methods reachable through the listed handout, not listed.
//
// Positive controls: the throat rejects what the slot admits (setAll with an
// accessor bag / non-plain proto throws), and `.limits` (listed) is reachable.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-store-slots-and-logger.ts
import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

function attempt(fn: () => void): string {
  try {
    fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}: ${(error as Error).message}`;
  }
}

async function main(): Promise<void> {
  const DP = { id: "9" };
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab", defaultParams: DP, custom: { k: 1 } },
    ] as never,
    {} as never,
    { svc: { n: 1 } } as never,
  );
  const ctx = getInternals(router);
  const api = getPluginApi(router);
  const depsApi = getDependenciesApi(router);

  await router.start("/home");

  // ---- a. dependencies slot
  const store = ctx.dependenciesGetStore() as unknown as {
    dependencies: Record<string, unknown>;
    limits: unknown;
  };
  const injected = { injected: true };
  let accessorReads = 0;

  store.dependencies.viaSlot = injected;
  Object.defineProperty(store.dependencies, "acc", {
    enumerable: true,
    configurable: true,
    get(): unknown {
      accessorReads++;

      return injected;
    },
  });

  const control_throatRejectsAccessor = attempt(() => {
    depsApi.setAll(
      Object.defineProperty({}, "acc2", {
        enumerable: true,
        get: () => injected,
      }) as never,
    );
  });
  const control_throatRejectsClassInstance = attempt(() => {
    depsApi.setAll(new (class Deps {})() as never);
  });
  const readBackViaGet = depsApi.get("viaSlot" as never) === injected;
  const all = depsApi.getAll() as Record<string, unknown>;
  const dependenciesSlot = {
    control_throatRejectsAccessor,
    control_throatRejectsClassInstance,
    control_limitsSlotReachable: store.limits !== undefined,
    slotWriteReadBackViaGet: readBackViaGet,
    slotWriteVisibleInGetAll: all.viaSlot === injected,
    accessorAdmittedBySlot_readsSoFar: accessorReads,
    accessorValueInGetAll: all.acc === injected,
    storeProto:
      Object.getPrototypeOf(store.dependencies) === null
        ? "null"
        : "Object.prototype",
  };

  // ---- b. routes store slots
  const rs = ctx.routeGetStore() as unknown as {
    config: {
      defaultParams: Record<string, unknown>;
      defaultSearch: Record<string, unknown>;
    };
    routeCustomFields: Record<string, Record<string, unknown>>;
    queryParamsCache: Map<string, string[]>;
    urlParamsCache: Map<string, string[]>;
    resolvedForwardMap: Record<string, string>;
    definitions: unknown[];
    matcher: Record<string, unknown>;
    tree: unknown;
  };
  const other = { id: "other" };
  const before = ctx.port().defaultParams("u");

  rs.config.defaultParams.u = other;

  const routesStoreSlots = {
    config_defaultParams_isCallersBag: before === DP,
    config_defaultParams_frozenMap: Object.isFrozen(rs.config.defaultParams),
    config_slotWriteReadBackByPort: ctx.port().defaultParams("u") === other,
    routeCustomFields_isGetRouteConfigRecord:
      rs.routeCustomFields.u === api.getRouteConfig("u"),
    queryParamsCache_isGetQueryParamsArray:
      rs.queryParamsCache.get("u") === ctx.getQueryParams("u"),
    definitions_isArray: Array.isArray(rs.definitions),
    definitions_frozen: Object.isFrozen(rs.definitions),
    resolvedForwardMap_frozen: Object.isFrozen(rs.resolvedForwardMap),
    storeFrozen: Object.isFrozen(rs),
    slotNames: Object.keys(rs),
  };

  rs.config.defaultParams.u = DP;

  // ---- c. logger handout
  const logger = ctx.logger as unknown as {
    warn: (...a: unknown[]) => void;
    configure?: (c: unknown) => void;
    getConfig?: () => { level: string };
  };
  const original = logger.warn;
  const seen: unknown[][] = [];

  logger.warn = (...a: unknown[]): void => {
    seen.push(a);
  };
  router.isActiveRoute("");
  logger.warn = original;

  let configured: unknown = "no configure method";

  if (typeof logger.configure === "function") {
    logger.configure({ level: "none" });
    configured = {
      cloneStateLoggerLevel: ctx.getCloneState().loggerConfig.level,
      getConfigLevel: logger.getConfig?.().level,
    };
    logger.configure({ level: "all" });
  }

  const loggerHandout = {
    instanceFrozen: Object.isFrozen(ctx.logger),
    overrideOfWarnObservedByCore: seen.length > 0 && seen[0][0] === "real-router",
    runtimeHasConfigure: typeof logger.configure === "function",
    configureRoundTrip: configured,
  };

  // ---- d. matcher methods through the handout
  const matcherMethods = {
    registerTree: typeof rs.matcher.registerTree,
    buildPath: typeof rs.matcher.buildPath,
    hasRoute: typeof rs.matcher.hasRoute,
    matcherFrozen: Object.isFrozen(rs.matcher),
  };

  console.log(
    JSON.stringify(
      { dependenciesSlot, routesStoreSlots, loggerHandout, matcherMethods },
      null,
      2,
    ),
  );
}

void main();
