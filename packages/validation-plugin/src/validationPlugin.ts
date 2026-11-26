// packages/validation-plugin/src/validationPlugin.ts

import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { raiser } from "@real-router/core/utils";
import { getInternals } from "@real-router/core/validation";

import { CORE_LIMIT_DEFAULTS } from "./helpers";
import { validateRouteName } from "./type-guards";
import { DefaultsMutationWatch } from "./validators/defaultsMutation";
import {
  validateDependencyName,
  validateSetDependencyArgs,
  validateDependenciesObject,
  validateDependencyBatchLimit,
  validateDependencyExists,
  validateDependencyLimit,
  reportDependencyCount,
  validateCloneArgs,
  warnOverwrite as warnDepsOverwrite,
  warnBatchOverwrite,
  warnRemoveNonExistent,
} from "./validators/dependencies";
import { validateListenerCountThresholds } from "./validators/eventBus";
import { nameInTable } from "./validators/forwardTo";
import {
  validateHandler,
  validateHandlerLimit,
  validateLifecycleCountThresholds,
  warnOverwrite as warnLifecycleOverwrite,
  warnAsyncGuardSync,
  warnNonBooleanGuard,
  warnNonBooleanGuardSync,
} from "./validators/lifecycle";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigateToStateArgs,
  validateNavigationOptions,
  validateNavigateParams,
  validateNavigateParamsShape,
  validateSearch,
  validateStartArgs,
} from "./validators/navigation";
import { validateOptions } from "./validators/options";
import {
  validatePluginLimit,
  validatePluginKeys,
  validateCountThresholds as validatePluginCountThresholds,
  warnBatchDuplicates,
  warnPluginMethodType,
  warnPluginAfterStart,
} from "./validators/plugins";
import {
  validateExistingRoutes,
  validateForwardToConsistency,
  validateRoutePropertiesStore,
  validateForwardToTargetsStore,
  validateDependenciesStructure,
  validateLimitsConsistency,
  validateConfiguredDefaultRoute,
  validateResolvedDefaultRoute,
  warnOrphanedGuards,
} from "./validators/retrospective";
import {
  createMisChanneledKeyReporter,
  validateBuildPathArgs,
  validateMatchPathArgs,
  validateIsActiveRouteArgs,
  validateShouldUpdateNodeArgs,
  validateStateBuilderArgs,
  validateAddRouteArgs,
  validateRoutes,
  validateRemoveRouteArgs,
  validateUpdateRouteBasicArgs,
  validateUpdateRoutePropertyTypes,
  validateUpdateRoute,
  validateParentOption as validateParentOptionRaw,
  throwIfInternalRoute,
  throwIfInternalRouteInArray,
  validateSetRootPathArgs,
  guardRouteCallbacks,
  guardNoAsyncCallbacks,
} from "./validators/routes";
import {
  createCodecRoundTripReporter,
  createDroppedQueryKeyReporter,
  createUndeclaredParamKeyReporter,
  validateAreStatesEqualArgs,
  validateMakeStateArgs,
} from "./validators/state";

import type { RouteLookup } from "./validators/forwardTo";
import type { ReloadPath } from "./validators/state";
import type {
  DefaultDependencies,
  NavigationOptions,
  PluginApi,
  PluginFactory,
  Route,
  RoutesApi,
} from "@real-router/core";
import type { RouteTree } from "@real-router/core/validation";

const atValidationPlugin = raiser("validation-plugin");
const atAddRoute = raiser("router", "addRoute");

/** The options a door judges for a call that passed none. */
const EMPTY_OPTIONS: NavigationOptions = Object.freeze({});

/**
 * The routers this plugin is installed on (#2349). A second install on one
 * router is refused: it would register every check and kind a second time, so
 * a call that passes would run each check twice and each report would print
 * twice. `teardown` takes the router out, and so does a retrospective pass
 * that throws.
 *
 * ⚠ A `WeakSet`, so the entry goes with its router. Each copy of this package
 * holds a set of its own, so a second COPY of the package installed on the
 * same router is not refused.
 */
const INSTALLED = new WeakSet<object>();

/** The one question existence asks of a tree node: its children by segment. */
interface TreeNode {
  children: ReadonlyMap<string, TreeNode>;
}

/**
 * The two questions the validators ask about routes that already exist,
 * answered from the curated surface (#2382).
 */
function createRouteLookup(api: PluginApi): RouteLookup {
  // ⚑ Existence WALKS the published tree rather than asking the matcher:
  // `getRoutesApi.has` would do the lookup too, but it runs `validateRouteName`
  // first and would rename a malformed `forwardTo` target's refusal to
  // `[router.hasRoute]`.
  //
  // ⚠ The walk answers what `matcher.hasRoute` answers except after
  // `children.set` on a handed-out tree — the Map shell-freeze exception
  // `engine/INVARIANTS.md` records.
  return {
    hasRoute: (name) => {
      let node = api.getTree() as TreeNode | undefined;

      for (const segment of name.split(".")) {
        node = node?.children.get(segment);

        if (!node) {
          return false;
        }
      }

      return true;
    },
    getUrlParams: (name) => api.getUrlParams(name),
  };
}

/** What the route validators read about the table a batch joins. */
interface JoinedTable {
  tree: RouteTree;
  lookup: RouteLookup;
  forwardMap: Readonly<Record<string, string>>;
}

/**
 * The lookup of a table with no route in it. A `RouteLookup` is asked for the
 * path slots of a route that exists, so this one is never asked for them.
 */
const NO_ROUTES: RouteLookup = {
  hasRoute: () => false,
  /* v8 ignore next -- @preserve unreachable: the table holds no route to ask about */
  getUrlParams: () => [],
};

/**
 * The table a `replace()` batch joins (#2562): the root the router keeps, with
 * no route and no forward under it. `add` extends the registered table and
 * `replace` discards it, so the route checks judge a replace batch as they judge
 * the same batch added to an empty router under that root —
 * `replace-batch.properties.ts` holds the two doors to that.
 *
 * ⚠ `children` and `nonAbsoluteChildren` both list the root's routes. Only
 * `children` is read by a validator today; the second is emptied too, so a
 * check that starts reading it does not get the discarded routes back.
 */
function emptyTableUnder(root: RouteTree): JoinedTable {
  return {
    tree: { ...root, children: new Map(), nonAbsoluteChildren: [] },
    lookup: NO_ROUTES,
    forwardMap: {},
  };
}

/**
 * Every top-level route, nested, as `RoutesApi.get` reports it — the config
 * slots the retrospective pass judges included.
 */
function readRoutes<Dependencies extends DefaultDependencies>(
  api: PluginApi,
  routesApi: RoutesApi<Dependencies>,
): Route<Dependencies>[] {
  const routes: Route<Dependencies>[] = [];

  for (const name of (api.getTree() as TreeNode).children.keys()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- a top-level name of the tree always names a route
    routes.push(routesApi.get(name)!);
  }

  return routes;
}

/**
 * The dependency map is a type parameter so the factory carries the CALLER's
 * `D` rather than the `object` default (#1621). `keyof object` is `never`, so a
 * bare `PluginFactory` types `getDependency` as `(key: never) => never`, which
 * TypeScript 7 refuses to assign where `PluginFactory<D>` is expected for any
 * `D` with an index signature — `usePlugin(validationPlugin())` stops compiling
 * for a consumer whose dependencies are `Record<string, T>`. TS 6 skipped that
 * variance check, so the imprecision was always there and simply invisible.
 *
 * `PluginFactory<never>` does NOT work as a shorthand here (unlike
 * `AnyOptions = Options<never>` in core): it fails on both compilers, because
 * this plugin actually reads dependencies.
 */
export function validationPlugin<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(): PluginFactory<Dependencies> {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  return (router) => {
    const ctx = getInternals(router);
    const api = getPluginApi(router);

    if (router.isActive()) {
      throw atValidationPlugin.code(
        "VALIDATION_PLUGIN_AFTER_START",
      )`must be registered before router.start()`;
    }

    // ⚑ One router, one install (#2349) — the `INSTALLED` mark above.
    //
    // ⚠ A CLONE needs no install of its own: `cloneRouter` re-runs plugin
    // factories by contract, which is what the message points at.
    if (INSTALLED.has(router)) {
      throw atValidationPlugin.code(
        "VALIDATION_PLUGIN_ALREADY_INSTALLED",
      )`is already installed on this router — a clone re-runs plugin factories, so it needs no usePlugin of its own`;
    }

    const defaultsWatch = new DefaultsMutationWatch();

    // ⚠ BEFORE the `NAVIGATE_TO_DEFAULT` subscription below, so its first
    // report already has a baseline to compare against.
    defaultsWatch.watch(api.getAdoptedOrigins());

    const lookup = createRouteLookup(api);

    // Marked BEFORE the retrospective pass, and unmarked when it throws, so a
    // corrected retry is accepted.
    INSTALLED.add(router);

    try {
      const routes = readRoutes(api, getRoutesApi(router));
      const forwardMap = api.getForwardMap();
      const limits = api.getResolvedLimits();
      const options = api.getOptions();

      validateExistingRoutes(routes);
      validateForwardToConsistency(forwardMap, lookup);
      validateRoutePropertiesStore(routes);
      validateForwardToTargetsStore(forwardMap, lookup);
      validateDependenciesStructure(
        ctx.dependenciesGetStore().dependencies,
        limits,
      );
      validateLimitsConsistency(
        options,
        api.getDependencyKeys().length,
        limits.maxDependencies,
      );
      validateOptions(options, "constructor (retrospective)");

      if (typeof options.defaultRoute === "string") {
        validateConfiguredDefaultRoute(options.defaultRoute, lookup);
      }
    } catch (error) {
      INSTALLED.delete(router);

      throw error;
    }

    // ⚠ At START, not at registration. The tree can still grow between the two —
    // `usePlugin` must run before `start()` here — so a check at registration
    // would report a guard for a route the caller is about to add. #2049 states
    // why the DOOR cannot answer it either.
    //
    // ⚠ An INTERCEPTOR, not an `onStart` hook, and the difference is measured: a
    // plugin hook is wired as a `$start` LISTENER, so it spends one of the
    // router's `maxListeners`. That budget is advertised (10000 by default) and
    // pinned by `limits.test.ts`, which registers exactly that many and expects
    // the next to throw — an `onStart` here turns the advertised number into
    // 9999 for every application that installs this plugin. Interceptors are
    // counted against nothing.
    const removeInterceptor = api.addInterceptor("start", (next, path) => {
      // ⚠ The diagnostic must NEVER be worse than its own absence. A start
      // interceptor WRAPS the call, so an unguarded throw here rejects
      // `start()` and leaves the router inactive — measured, core turns it
      // into "a `start` interceptor returned without calling next()". A
      // `$start` listener would have swallowed it instead, so this catch is
      // what buys the same safety explicitly rather than by accident.
      /* v8 ignore start -- @preserve: the catch exists so a bug in the
           diagnostic cannot reject `start()`; by construction nothing above it
           throws, so the arm has no reachable input. Removing it is the change
           this comment exists to argue against. */
      try {
        warnOrphanedGuards(api.getExternalGuardNames(), lookup, api.logger);
      } catch {
        // A broken diagnostic is not the application's problem.
      }
      /* v8 ignore stop */

      return next(path);
    });

    // ⚠ Core hands this position `ownParams` — the copy it will print the path
    // from — which no seam can reach, because at the call boundary that object
    // does not exist yet (#2134 / #2388).
    //
    // ⚠ Registered AFTER the retrospective pass above, so a pass that throws
    // leaves nothing registered behind it.
    const removeParamsCheck = api.addCheck("buildPath:params", (ownParams) => {
      validateNavigateParams(ownParams, "buildPath");
    });

    // ⚠ The resolved printer is reached INDEPENDENTLY of the facade's — the
    // href door runs the forward chain itself and lands here — so it carries its
    // own registration rather than sharing one, and the message names it.
    const removeResolvedParamsCheck = api.addCheck(
      "buildPathResolved:params",
      (ownParams) => {
        validateNavigateParams(ownParams, "buildPathResolved");
      },
    );

    // ⚠ The calls inside each ENTRY check keep the order core consulted them
    // in: the first refusal is the message the caller gets, so reordering them
    // changes which defect a caller hears about when an argument has two.
    const removeCanNavigateToEntryCheck = api.addCheck(
      "canNavigateTo:entry",
      (name, params, search) => {
        validateRouteName(name, "canNavigateTo");
        validateNavigateParamsShape(params, "canNavigateTo");
        validateSearch(search, "canNavigateTo");
      },
    );

    const removeCanNavigateToParamsCheck = api.addCheck(
      "canNavigateTo:params",
      (ownParams) => {
        validateNavigateParams(ownParams, "canNavigateTo");
      },
    );

    const removeNavigateEntryCheck = api.addCheck(
      "navigate:entry",
      (routeName, routeParams, search, options) => {
        validateNavigateArgs(routeName);
        validateNavigateParamsShape(routeParams, "navigate");
        validateSearch(search, "navigate");
        validateNavigationOptions(options, "navigate");
      },
    );

    const removeNavigateParamsCheck = api.addCheck(
      "navigate:params",
      (ownParams) => {
        validateNavigateParams(ownParams, "navigate");
      },
    );

    // ⚠ The callback walk runs FIRST at both batch positions, because that is
    // where core ran it: a route whose `canActivate` is not a function is
    // refused before anything asks about names or paths.
    const walkRouteCallbacks = (
      batch: readonly Route[],
      parentName: unknown,
    ): void => {
      for (const route of batch) {
        const fullName = nameInTable(parentName, route.name);

        guardRouteCallbacks(route);
        guardNoAsyncCallbacks(route, fullName);

        if (route.children !== undefined) {
          walkRouteCallbacks(route.children, fullName);
        }
      }
    };

    const checkRouteBatch = (
      batch: readonly Route[],
      caller: "addRoute" | "replaceRoutes",
      parentName: string | undefined,
      readTable: () => JoinedTable,
    ): void => {
      // ⚠ The parent option is judged below the walk, so the walk joins it to
      // a name only once the table holds it: joined to an option about to be
      // refused, the name is one no route can have.
      walkRouteCallbacks(
        batch,
        typeof parentName === "string" && lookup.hasRoute(parentName)
          ? parentName
          : undefined,
      );

      if (parentName !== undefined) {
        validateParentOptionRaw(parentName);

        if (!lookup.hasRoute(parentName)) {
          throw atAddRoute.ref`Parent route "${parentName}" does not exist`;
        }
      }

      throwIfInternalRouteInArray(batch, caller);
      validateAddRouteArgs(batch, parentName);

      // ⚠ Read HERE, not at the door: the walk and the argument checks above
      // run application code (a route function's own `toString`), and a table
      // read before it can be one the router no longer holds.
      const table = readTable();

      validateRoutes(
        batch as Route[],
        table.tree,
        table.lookup,
        table.forwardMap,
        parentName,
      );
    };

    const removeAddRouteCheck = api.addCheck(
      "addRoute:batch",
      (batch, parentName) => {
        checkRouteBatch(
          batch as readonly Route[],
          "addRoute",
          parentName,
          () => ({
            tree: api.getTree(),
            lookup,
            forwardMap: api.getForwardMap(),
          }),
        );
      },
    );

    const removeReplaceRoutesCheck = api.addCheck(
      "replaceRoutes:batch",
      (batch) => {
        checkRouteBatch(
          batch as readonly Route[],
          "replaceRoutes",
          undefined,
          () => emptyTableUnder(api.getTree()),
        );
      },
    );

    const removeRemoveRouteCheck = api.addCheck("removeRoute:entry", (name) => {
      validateRemoveRouteArgs(name);
      throwIfInternalRoute(name, "removeRoute");
    });

    const removeUpdateRouteCheck = api.addCheck(
      "updateRoute:entry",
      (name, updates) => {
        const upd = updates as Record<string, unknown>;

        validateUpdateRouteBasicArgs(name, updates);
        throwIfInternalRoute(name, "updateRoute");
        validateUpdateRoutePropertyTypes({
          forwardTo: upd.forwardTo,
          defaultParams: upd.defaultParams,
          defaultSearch: upd.defaultSearch,
          decodeParams: upd.decodeParams,
          encodeParams: upd.encodeParams,
          canActivate: upd.canActivate,
          canDeactivate: upd.canDeactivate,
        });
        validateUpdateRoute(
          name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          upd.forwardTo as any,
          lookup,
          api.getForwardMap(),
        );
      },
    );

    const removeHasRouteCheck = api.addCheck("hasRoute:entry", (name) => {
      validateRouteName(name, "hasRoute");
    });

    const removeGetRouteCheck = api.addCheck("getRoute:entry", (name) => {
      validateRouteName(name, "getRoute");
    });

    // ⚠ The two state builders consult the SAME pair in opposite orders, and
    // each check keeps its own door's order: the first refusal is the message
    // the caller gets.
    const removeForwardStateCheck = api.addCheck(
      "forwardState:entry",
      (routeName, routeParams, routeSearch) => {
        validateStateBuilderArgs(routeName, routeParams, "forwardState");
        validateSearch(routeSearch, "forwardState");
      },
    );

    const removeBuildNavigationStateCheck = api.addCheck(
      "buildNavigationState:state",
      (name, ownParams, search) => {
        validateSearch(search, "buildNavigationState");
        validateStateBuilderArgs(name, ownParams, "buildNavigationState");
      },
    );

    const removeAddActivateGuardCheck = api.addCheck(
      "addActivateGuard:entry",
      (name, handler) => {
        validateRouteName(name, "addActivateGuard");
        validateHandler(handler, "addActivateGuard");
      },
    );

    const removeAddDeactivateGuardCheck = api.addCheck(
      "addDeactivateGuard:entry",
      (name, handler) => {
        validateRouteName(name, "addDeactivateGuard");
        validateHandler(handler, "addDeactivateGuard");
      },
    );

    const removeRemoveActivateGuardCheck = api.addCheck(
      "removeActivateGuard:entry",
      (name) => {
        validateRouteName(name, "removeActivateGuard");
      },
    );

    const removeRemoveDeactivateGuardCheck = api.addCheck(
      "removeDeactivateGuard:entry",
      (name) => {
        validateRouteName(name, "removeDeactivateGuard");
      },
    );

    const removeGetDependencyEntryCheck = api.addCheck(
      "getDependency:entry",
      (name) => {
        validateDependencyName(name, "getDependency");
      },
    );

    const removeGetDependencyValueCheck = api.addCheck(
      "getDependency:value",
      (name, value) => {
        validateDependencyExists(value, name);
      },
    );

    const removeSetDependencyEntryCheck = api.addCheck(
      "setDependency:entry",
      (name) => {
        validateSetDependencyArgs(name);
      },
    );

    // ⚑ The limit half of the count. Its thresholds are a diagnostic of the
    // same count, registered below, and core asks this position first.
    const removeSetDependencyCountCheck = api.addCheck(
      "setDependency:count",
      (currentCount, maxDependencies) => {
        validateDependencyLimit(currentCount, maxDependencies, "setDependency");
      },
    );

    const removeSetDependenciesEntryCheck = api.addCheck(
      "setDependencies:entry",
      (deps) => {
        validateDependenciesObject(deps, "setDependencies");
        // ⚑ The limit, asked here rather than from inside the ingest loop
        // (#2253). Core asks this position once, before it writes a key, so a
        // refusal here leaves the record as it was. The shape check above runs
        // first: a bag that is not a plain object, or carries a getter, is
        // refused for what it IS before it is measured.
        validateDependencyBatchLimit(
          deps,
          api.getDependencyKeys(),
          api.getResolvedLimits().maxDependencies,
          "setDependencies",
        );
      },
    );

    // ⚠ Behind the batch limit above, this refusal fires only when the record
    // or the bag changes between that limit and core's walk.
    const removeSetDependenciesCountCheck = api.addCheck(
      "setDependencies:count",
      (currentCount, maxDependencies) => {
        validateDependencyLimit(
          currentCount,
          maxDependencies,
          "setDependencies",
        );
      },
    );

    const removeRemoveDependencyEntryCheck = api.addCheck(
      "removeDependency:entry",
      (name) => {
        validateDependencyName(name, "removeDependency");
      },
    );

    const removeHasDependencyEntryCheck = api.addCheck(
      "hasDependency:entry",
      (name) => {
        validateDependencyName(name, "hasDependency");
      },
    );

    const removeCloneRouterEntryCheck = api.addCheck(
      "cloneRouter:entry",
      (dependencies) => {
        validateCloneArgs(dependencies);
      },
    );

    const removeUsePluginCountCheck = api.addCheck(
      "usePlugin:count",
      (currentCount, newCount, maxPlugins) => {
        validatePluginLimit(currentCount, newCount, maxPlugins);
      },
    );

    const removeUsePluginPluginCheck = api.addCheck(
      "usePlugin:plugin",
      (plugin) => {
        validatePluginKeys(plugin);
      },
    );

    // ⚠ A DIAGNOSTIC, not a check, and the channel is the difference rather
    // than the style: this one cannot refuse the registration it describes —
    // the plugin is already installed by the time core reports.
    const removePluginAfterStartDiagnostic = api.subscribeDiagnostic(
      "PLUGIN_AFTER_START",
      (methodName) => {
        warnPluginAfterStart(methodName, api.logger);
      },
    );

    const removeSetDependencyCountDiagnostic = api.subscribeDiagnostic(
      "SET_DEPENDENCY_COUNT",
      (currentCount, maxDependencies) => {
        reportDependencyCount(
          currentCount,
          maxDependencies,
          "setDependency",
          api.logger,
        );
      },
    );

    const removeSetDependenciesCountDiagnostic = api.subscribeDiagnostic(
      "SET_DEPENDENCIES_COUNT",
      (currentCount, maxDependencies) => {
        reportDependencyCount(
          currentCount,
          maxDependencies,
          "setDependencies",
          api.logger,
        );
      },
    );

    const removeSetDependencyOverwriteDiagnostic = api.subscribeDiagnostic(
      "SET_DEPENDENCY_OVERWRITE",
      (name) => {
        warnDepsOverwrite(name, "setDependency", api.logger);
      },
    );

    const removeSetDependenciesOverwriteDiagnostic = api.subscribeDiagnostic(
      "SET_DEPENDENCIES_OVERWRITE",
      (keys) => {
        warnBatchOverwrite(keys, "setDependencies", api.logger);
      },
    );

    const removeRemoveDependencyMissingDiagnostic = api.subscribeDiagnostic(
      "REMOVE_DEPENDENCY_MISSING",
      (name) => {
        warnRemoveNonExistent(name, api.logger);
      },
    );

    const removeUsePluginCountDiagnostic = api.subscribeDiagnostic(
      "USE_PLUGIN_COUNT",
      (count) => {
        validatePluginCountThresholds(
          count,
          api.getOptions().limits?.maxPlugins ?? CORE_LIMIT_DEFAULTS.maxPlugins,
          api.logger,
        );
      },
    );

    const removeUsePluginDuplicateDiagnostic = api.subscribeDiagnostic(
      "USE_PLUGIN_DUPLICATE_IN_BATCH",
      () => {
        warnBatchDuplicates(api.logger);
      },
    );

    const removeUsePluginHookDiagnostic = api.subscribeDiagnostic(
      "USE_PLUGIN_HOOK_NOT_FUNCTION",
      (methodName) => {
        warnPluginMethodType(methodName, api.logger);
      },
    );

    // ⚑ One position and two kinds per guard type: the messages name the
    // type's `canActivate` / `canDeactivate` door, and core asks the count
    // position before it raises the count kind.
    const removeCanActivateCountCheck = api.addCheck(
      "canActivate:count",
      (currentCount) => {
        validateHandlerLimit(
          currentCount,
          "canActivate",
          api.getOptions().limits?.maxLifecycleHandlers ??
            CORE_LIMIT_DEFAULTS.maxLifecycleHandlers,
        );
      },
    );

    const removeCanDeactivateCountCheck = api.addCheck(
      "canDeactivate:count",
      (currentCount) => {
        validateHandlerLimit(
          currentCount,
          "canDeactivate",
          api.getOptions().limits?.maxLifecycleHandlers ??
            CORE_LIMIT_DEFAULTS.maxLifecycleHandlers,
        );
      },
    );

    const removeCanActivateCountDiagnostic = api.subscribeDiagnostic(
      "CAN_ACTIVATE_COUNT",
      (count) => {
        validateLifecycleCountThresholds(
          count,
          "canActivate",
          api.getOptions().limits?.maxLifecycleHandlers ??
            CORE_LIMIT_DEFAULTS.maxLifecycleHandlers,
          api.logger,
        );
      },
    );

    const removeCanDeactivateCountDiagnostic = api.subscribeDiagnostic(
      "CAN_DEACTIVATE_COUNT",
      (count) => {
        validateLifecycleCountThresholds(
          count,
          "canDeactivate",
          api.getOptions().limits?.maxLifecycleHandlers ??
            CORE_LIMIT_DEFAULTS.maxLifecycleHandlers,
          api.logger,
        );
      },
    );

    const removeCanActivateOverwriteDiagnostic = api.subscribeDiagnostic(
      "CAN_ACTIVATE_OVERWRITE",
      (name) => {
        warnLifecycleOverwrite(name, "activate", "canActivate", api.logger);
      },
    );

    const removeCanDeactivateOverwriteDiagnostic = api.subscribeDiagnostic(
      "CAN_DEACTIVATE_OVERWRITE",
      (name) => {
        warnLifecycleOverwrite(name, "deactivate", "canDeactivate", api.logger);
      },
    );

    const removeSyncGuardThenableDiagnostic = api.subscribeDiagnostic(
      "SYNC_GUARD_THENABLE",
      (name, methodName) => {
        warnAsyncGuardSync(name, methodName, api.logger);
      },
    );

    const removeSyncGuardNonBooleanDiagnostic = api.subscribeDiagnostic(
      "SYNC_GUARD_NON_BOOLEAN",
      (name, answer, methodName) => {
        warnNonBooleanGuardSync(name, answer, methodName, api.logger);
      },
    );

    const removeGuardNonBooleanDiagnostic = api.subscribeDiagnostic(
      "GUARD_NON_BOOLEAN",
      (name, answer) => {
        warnNonBooleanGuard(name, answer, api.logger);
      },
    );

    const removeListenerCountDiagnostic = api.subscribeDiagnostic(
      "LISTENER_COUNT",
      (count, eventName, methodName) => {
        validateListenerCountThresholds(
          count,
          eventName,
          methodName,
          api.logger,
          api.getOptions().limits?.maxListeners ??
            CORE_LIMIT_DEFAULTS.maxListeners,
        );
      },
    );

    // ⚑ An omitted bag is judged as the empty one core runs on, and a `null`
    // one as itself, which this door refuses.
    const removeNavigateToStateEntryCheck = api.addCheck(
      "navigateToState:entry",
      (state, options) => {
        validateNavigateToStateArgs(state);
        validateNavigationOptions(
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- the declared type admits no `null`, and `??` would admit a JavaScript caller's
          options === undefined ? EMPTY_OPTIONS : options,
          "navigateToState",
        );
      },
    );

    const removeSetRootPathEntryCheck = api.addCheck(
      "setRootPath:entry",
      (rootPath) => {
        validateSetRootPathArgs(rootPath);
      },
    );

    // ⚑ The bag's type first, then its fields. The first refuses `null`, so
    // the `??` below substitutes the empty bag core runs on for an omitted one
    // alone.
    const removeNavigateToDefaultEntryCheck = api.addCheck(
      "navigateToDefault:entry",
      (options) => {
        validateNavigateToDefaultArgs(options);
        validateNavigationOptions(
          options ?? EMPTY_OPTIONS,
          "navigateToDefault",
        );
      },
    );

    const removeNavigateToDefaultRouteCheck = api.addCheck(
      "navigateToDefault:route",
      (routeName) => {
        validateResolvedDefaultRoute(routeName, lookup);
      },
    );

    const removeStartEntryCheck = api.addCheck("start:entry", (path) => {
      validateStartArgs(path);
    });

    // ⚑ The render-path doors and the state builders (#2388). Each ENTRY check
    // keeps the order core consulted its calls in, as above.
    const removeBuildPathEntryCheck = api.addCheck(
      "buildPath:entry",
      (route, params, search) => {
        validateBuildPathArgs(route);
        validateNavigateParamsShape(params, "buildPath");
        validateSearch(search, "buildPath");
      },
    );

    const removeBuildPathResolvedEntryCheck = api.addCheck(
      "buildPathResolved:entry",
      (params, search) => {
        validateNavigateParamsShape(params, "buildPathResolved");
        validateSearch(search, "buildPathResolved");
      },
    );

    const removeIsActiveRouteEntryCheck = api.addCheck(
      "isActiveRoute:entry",
      (name, params, search, strictEquality, ignoreQueryParams) => {
        validateIsActiveRouteArgs(
          name,
          params,
          strictEquality,
          ignoreQueryParams,
        );
        validateSearch(search, "isActiveRoute");
        validateRouteName(name, "isActiveRoute");
      },
    );

    const removeAreStatesEqualEntryCheck = api.addCheck(
      "areStatesEqual:entry",
      (state1, state2, ignoreQueryParams) => {
        validateAreStatesEqualArgs(state1, state2, ignoreQueryParams);
      },
    );

    const removeShouldUpdateNodeEntryCheck = api.addCheck(
      "shouldUpdateNode:entry",
      (nodeName) => {
        validateShouldUpdateNodeArgs(nodeName);
      },
    );

    const removeMatchPathEntryCheck = api.addCheck(
      "matchPath:entry",
      (path) => {
        validateMatchPathArgs(path);
      },
    );

    // ⚑ A decoder's output is application code's, judged as a caller's bag
    // would be (#1582). Core asks only for a route that has a decoder.
    const removeMatchPathDecodedCheck = api.addCheck(
      "matchPath:decoded",
      (routeName, decodedParams) => {
        validateStateBuilderArgs(routeName, decodedParams, "matchPath");
      },
    );

    const removeMakeStateCheck = api.addCheck(
      "makeState:state",
      (name, ownParams, search, path) => {
        validateMakeStateArgs(name, ownParams, path);
        validateSearch(search, "makeState");
      },
    );

    const removeNavigateStateCheck = api.addCheck(
      "navigate:state",
      (routeName, routeParams) => {
        validateStateBuilderArgs(routeName, routeParams, "navigate");
      },
    );

    // ⚑ The retired single-bag spelling (#2238), reported at the two doors
    // whose answers stay silent about it. One de-dup cache per registration,
    // i.e. per router (#1583), and both kinds share it, so a pair reported at
    // one door is not reported again at the other.
    const reportMisChanneledKey = createMisChanneledKeyReporter(
      api.logger,
      (routeName) => api.getDeclaredQueryNames(routeName),
    );

    const removeBuildPathDiagnostic = api.subscribeDiagnostic(
      "BUILD_PATH",
      (routeName, params) => {
        reportMisChanneledKey(routeName, params);
      },
    );

    const removeIsActiveRouteDiagnostic = api.subscribeDiagnostic(
      "IS_ACTIVE_ROUTE",
      (routeName, params) => {
        reportMisChanneledKey(routeName, params);
      },
    );

    // ⚑ HERE, and not on every navigation. No door READS the watched bags
    // after construction — core runs on the copy adoption took (#2171) — so
    // the question is where a stale one would have CHANGED the outcome, and
    // `navigateToDefault` is the only door where those slots take effect.
    // Measured: with a counting getter on the bag, `start`, `navigate` and
    // `buildPath` add zero reads, and `buildPath` refuses a missing param
    // rather than filling it from the option. An application that never calls
    // `navigateToDefault` is never charged for the check.
    const removeNavigateToDefaultDiagnostic = api.subscribeDiagnostic(
      "NAVIGATE_TO_DEFAULT",
      () => {
        defaultsWatch.check(api.logger);
      },
    );

    // The route resolver's three reports (#1575, #1579, #2905). Each reporter
    // is built here with its own de-dup cache, once per registration, i.e. per
    // router (#1583): a module-level `Set` would let the first router in a
    // process silence every one after it — the SSR / SSG case, where a
    // diagnostic fires for request #1 and never again.
    const reportDroppedQueryKey = createDroppedQueryKeyReporter(api.logger);
    const reportUndeclaredParamKey = createUndeclaredParamKeyReporter(
      api.logger,
    );
    // The codec diagnostic's reload does not rebuild the path: the rebuild
    // runs `encodeParams` over what the reload decoded, and an encoder that
    // cannot print it would throw away the reload the diagnostic judges.
    // `PluginApi.matchPath` takes the router's options, so the reload is asked
    // of the internals.
    const reloadPath: ReloadPath = (path) =>
      ctx.matchPath(path, { ...api.getOptions(), rewritePathOnMatch: false });
    const reportCodecRoundTrip = createCodecRoundTripReporter(
      api.logger,
      reloadPath,
      api.forwardState,
    );

    const removeDroppedQueryKeyDiagnostic = api.subscribeDiagnostic(
      "DROPPED_QUERY_KEY",
      (routeName, key) => {
        reportDroppedQueryKey(routeName, key);
      },
    );

    const removeUndeclaredParamKeyDiagnostic = api.subscribeDiagnostic(
      "UNDECLARED_PARAM_KEY",
      (routeName, key) => {
        reportUndeclaredParamKey(routeName, key);
      },
    );

    const removeCodecRoundTripDiagnostic = api.subscribeDiagnostic(
      "CODEC_ROUND_TRIP",
      (state, codec, pathSlots) => {
        reportCodecRoundTrip(state, codec, pathSlots);
      },
    );

    return {
      teardown() {
        removeParamsCheck();

        removeResolvedParamsCheck();

        removeCanNavigateToEntryCheck();

        removeCanNavigateToParamsCheck();

        removeNavigateEntryCheck();

        removeNavigateParamsCheck();

        removeAddRouteCheck();

        removeReplaceRoutesCheck();

        removeRemoveRouteCheck();

        removeUpdateRouteCheck();

        removeHasRouteCheck();

        removeGetRouteCheck();

        removeForwardStateCheck();

        removeBuildNavigationStateCheck();

        removeAddActivateGuardCheck();

        removeAddDeactivateGuardCheck();

        removeRemoveActivateGuardCheck();

        removeRemoveDeactivateGuardCheck();

        removeGetDependencyEntryCheck();

        removeGetDependencyValueCheck();

        removeSetDependencyEntryCheck();

        removeSetDependencyCountCheck();

        removeSetDependenciesEntryCheck();

        removeSetDependenciesCountCheck();

        removeRemoveDependencyEntryCheck();

        removeHasDependencyEntryCheck();

        removeCloneRouterEntryCheck();

        removeUsePluginCountCheck();

        removeUsePluginPluginCheck();

        removePluginAfterStartDiagnostic();

        removeSetDependencyCountDiagnostic();

        removeSetDependenciesCountDiagnostic();

        removeSetDependencyOverwriteDiagnostic();

        removeSetDependenciesOverwriteDiagnostic();

        removeRemoveDependencyMissingDiagnostic();

        removeUsePluginCountDiagnostic();

        removeUsePluginDuplicateDiagnostic();

        removeUsePluginHookDiagnostic();

        removeCanActivateCountCheck();

        removeCanDeactivateCountCheck();

        removeCanActivateCountDiagnostic();

        removeCanDeactivateCountDiagnostic();

        removeCanActivateOverwriteDiagnostic();

        removeCanDeactivateOverwriteDiagnostic();

        removeSyncGuardThenableDiagnostic();

        removeSyncGuardNonBooleanDiagnostic();

        removeGuardNonBooleanDiagnostic();

        removeListenerCountDiagnostic();

        removeNavigateToStateEntryCheck();

        removeSetRootPathEntryCheck();

        removeNavigateToDefaultEntryCheck();

        removeNavigateToDefaultRouteCheck();

        removeStartEntryCheck();

        removeBuildPathEntryCheck();

        removeBuildPathResolvedEntryCheck();

        removeIsActiveRouteEntryCheck();

        removeAreStatesEqualEntryCheck();

        removeShouldUpdateNodeEntryCheck();

        removeMatchPathEntryCheck();

        removeMatchPathDecodedCheck();

        removeMakeStateCheck();

        removeNavigateStateCheck();

        removeBuildPathDiagnostic();

        removeIsActiveRouteDiagnostic();

        removeNavigateToDefaultDiagnostic();

        removeDroppedQueryKeyDiagnostic();

        removeUndeclaredParamKeyDiagnostic();

        removeCodecRoundTripDiagnostic();

        removeInterceptor();

        INSTALLED.delete(router);
      },
    };
  };
}
