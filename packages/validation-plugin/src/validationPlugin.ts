// packages/validation-plugin/src/validationPlugin.ts

import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { raiser } from "@real-router/core/utils";
import { getInternals } from "@real-router/core/validation";

import { CORE_LIMIT_DEFAULTS } from "./helpers";
import {
  validateRouteName,
  isState,
  isBoolean,
  getTypeDescription,
} from "./type-guards";
import { DefaultsMutationWatch } from "./validators/defaultsMutation";
import {
  validateDependencyName,
  validateSetDependencyArgs as validateSetDependencyArgsRaw,
  validateDependenciesObject,
  validateDependencyBatchLimit,
  validateDependencyExists as validateDependencyExistsRaw,
  validateDependencyCount,
  validateCloneArgs,
  warnOverwrite as warnDepsOverwrite,
  warnBatchOverwrite,
  warnRemoveNonExistent,
} from "./validators/dependencies";
import {
  validateListenerArgs,
  validateListenerCountThresholds,
} from "./validators/eventBus";
import {
  validateHandler,
  validateHandlerLimit,
  validateLifecycleCountThresholds,
  warnOverwrite as warnLifecycleOverwrite,
  warnAsyncGuardSync,
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
  validateNoDuplicatePlugins,
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
  createDroppedQueryKeyReporter,
  createUndeclaredParamKeyReporter,
  validateMakeStateArgs,
} from "./validators/state";

import type { EventName, EventMethodMap } from "./validators/eventBus";
import type { RouteLookup } from "./validators/forwardTo";
import type {
  DefaultDependencies,
  PluginApi,
  PluginFactory,
  RouterValidator,
  Route,
  RoutesApi,
  Plugin,
} from "@real-router/core";

const atValidationPlugin = raiser("validation-plugin");
const atAddRoute = raiser("router", "addRoute");
const atAreStatesEqual = raiser("router", "areStatesEqual");

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

function buildValidatorObject(
  api: PluginApi,
  lookup: RouteLookup,
  defaultsWatch: DefaultsMutationWatch,
): RouterValidator {
  // One de-dup cache per validator object, i.e. per registration, i.e. per router
  // (#1583) — the same lifetime the mode gate's reporters get, for the same
  // reason: a module-level Set would let the first router in a process silence
  // every one after it.
  const reportMisChanneledKey = createMisChanneledKeyReporter((routeName) =>
    api.getDeclaredQueryNames(routeName),
  );

  return {
    routes: {
      validateBuildPathArgs(route, params) {
        validateBuildPathArgs(route);
        reportMisChanneledKey(route, params);
      },
      validateMatchPathArgs,
      validateIsActiveRouteArgs(name, params, strict, ignoreQP) {
        // An assertion, so `name` is a string below by the type system rather
        // than by a second runtime check.
        validateIsActiveRouteArgs(name, params, strict, ignoreQP);
        reportMisChanneledKey(name, params);
      },
      validateShouldUpdateNodeArgs,
      validateStateBuilderArgs,

      validateRouteName(name, caller) {
        validateRouteName(name, caller);
      },
      validateSetRootPathArgs,
    },
    options: {
      validateOptions,
      validateResolvedDefaultRoute(routeName) {
        validateResolvedDefaultRoute(routeName, lookup);
      },
    },
    dependencies: {
      validateDependencyName,
      validateSetDependencyArgs(_name, _value, _caller) {
        validateSetDependencyArgsRaw(_name);
      },
      validateDependenciesObject(deps, methodName) {
        validateDependenciesObject(deps, methodName);

        // ⚑ The limit, asked here rather than from inside the ingest loop
        // (#2253). This is core's only pre-flight call on the whole bag, so it
        // is the one position where a refusal can precede every write. The
        // shape check above runs first: a bag that is not a plain object, or
        // carries a getter, is refused for what it IS before it is measured.
        validateDependencyBatchLimit(
          deps,
          api.getDependencyKeys(),
          api.getResolvedLimits().maxDependencies,
          methodName,
        );
      },
      validateDependencyExists(name, value) {
        validateDependencyExistsRaw(value, name);
      },
      validateDependencyCount(currentCount, maxDependencies, methodName) {
        validateDependencyCount(
          currentCount,
          maxDependencies,
          methodName,
          api.logger,
        );
      },
      validateCloneArgs,
      warnOverwrite(name, methodName) {
        warnDepsOverwrite(name, methodName, api.logger);
      },
      warnBatchOverwrite(keys, methodName) {
        warnBatchOverwrite(keys, methodName, api.logger);
      },
      warnRemoveNonExistent(name) {
        warnRemoveNonExistent(name, api.logger);
      },
    },
    plugins: {
      validatePluginLimit(count, limits) {
        validatePluginLimit(
          count,
          1,
          (limits as { maxPlugins?: number } | undefined)?.maxPlugins,
        );
      },
      validateNoDuplicatePlugins,
      validatePluginKeys,
      validateCountThresholds(count) {
        const maxPlugins =
          api.getOptions().limits?.maxPlugins ?? CORE_LIMIT_DEFAULTS.maxPlugins;

        validatePluginCountThresholds(count, maxPlugins, api.logger);
      },
      warnBatchDuplicates() {
        warnBatchDuplicates(api.logger);
      },
      warnPluginMethodType(methodName) {
        warnPluginMethodType(methodName, api.logger);
      },
    },
    lifecycle: {
      validateHandlerLimit(count, methodName) {
        const maxHandlers =
          api.getOptions().limits?.maxLifecycleHandlers ??
          CORE_LIMIT_DEFAULTS.maxLifecycleHandlers;

        validateHandlerLimit(count, methodName, maxHandlers);
      },
      validateCountThresholds(count, methodName) {
        const maxHandlers =
          api.getOptions().limits?.maxLifecycleHandlers ??
          CORE_LIMIT_DEFAULTS.maxLifecycleHandlers;

        validateLifecycleCountThresholds(
          count,
          methodName,
          maxHandlers,
          api.logger,
        );
      },
      warnOverwrite(name, type, methodName) {
        warnLifecycleOverwrite(name, type, methodName, api.logger);
      },
      warnAsyncGuardSync(name, methodName) {
        warnAsyncGuardSync(name, methodName, api.logger);
      },
    },
    navigation: {
      validateNavigateToDefaultArgs(opts) {
        validateNavigateToDefaultArgs(opts);
        // ⚑ HERE, and not on every navigation. No door READS the watched bags
        // after construction — core runs on the copy adoption took (#2171) — so
        // the question is where a stale one would have CHANGED the outcome, and
        // this is the only door where those slots take effect. Measured: with a
        // counting getter on the bag, `start`, `navigate` and `buildPath` add
        // zero reads, and `buildPath` refuses a missing param rather than filling
        // it from the option. An application that never calls this is never
        // charged for the check.
        defaultsWatch.check(api.logger);
      },
      validateNavigateToStateArgs,
      validateNavigationOptions,
      validateParamsShape: validateNavigateParamsShape,
      validateSearch,
      validateStartArgs,
    },
    state: {
      validateMakeStateArgs,
      // One de-dup cache per validator object, i.e. per registration, i.e. per
      // router (#1583). Module-level `Set`s made the first router in a process
      // silence every one after it — the SSR / SSG case where the diagnostic
      // fired for request #1 and never again.
      reportDroppedQueryKey: createDroppedQueryKeyReporter(),
      reportUndeclaredParamKey: createUndeclaredParamKeyReporter(),
      validateAreStatesEqualArgs(s1, s2, ignoreQP) {
        if (!isState(s1)) {
          throw atAreStatesEqual.type`Invalid state1: ${getTypeDescription(s1)}. Expected State object.`;
        }
        if (!isState(s2)) {
          throw atAreStatesEqual.type`Invalid state2: ${getTypeDescription(s2)}. Expected State object.`;
        }
        if (ignoreQP !== undefined && !isBoolean(ignoreQP)) {
          throw atAreStatesEqual.type`Invalid ignoreQueryParams: ${getTypeDescription(ignoreQP)}. Expected boolean.`;
        }
      },
    },
    eventBus: {
      validateListenerArgs(name, cb) {
        validateListenerArgs<EventName>(
          name as EventName,
          cb as Plugin[EventMethodMap[EventName]],
        );
      },
      validateCountThresholds(count, eventName, methodName) {
        const maxListeners =
          api.getOptions().limits?.maxListeners ??
          CORE_LIMIT_DEFAULTS.maxListeners;

        validateListenerCountThresholds(
          count,
          eventName,
          methodName,
          api.logger,
          maxListeners,
        );
      },
    },
  };
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

    // ⚑ One router, one validator (#2349). `RouterInternals.validator` is a
    // single slot and `teardown` clears it, so with two installs either
    // teardown leaves a registered plugin whose validator no longer answers.
    // The refusal keeps that state unrepresentable; a tally of installs only
    // models an ownership the slot does not grant.
    //
    // ⚠ A CLONE needs no install of its own: `cloneRouter` re-runs plugin
    // factories by contract, which is what the message points at.
    if (ctx.validator !== null) {
      throw atValidationPlugin.code(
        "VALIDATION_PLUGIN_ALREADY_INSTALLED",
      )`is already installed on this router — a clone re-runs plugin factories, so it needs no usePlugin of its own`;
    }

    // RouterInternals.validator is now mutable — direct assignment works
    const defaultsWatch = new DefaultsMutationWatch();

    // ⚠ BEFORE the validator goes live, so the first `navigateToDefault` after
    // this line already has a baseline to compare against.
    defaultsWatch.watch(api.getAdoptedOrigins());

    // ⚑ The object is held so teardown can prove it is still the holder.
    // The slot has no owner — `RouterInternals.validator` is plain data on a
    // surface pinned `accessorNames === []`, so a second writer cannot be
    // REFUSED here. What it can be is not silently destroyed: an
    // unconditional `= null` on teardown nulls whoever holds the slot now.
    // Measured: with a second writer in place, teardown destroyed the
    // foreign validator; the control (no second writer) nulled its own.
    // Same shape as `claimContextNamespace`, which checks the holder on
    // write and on release (#2059 / #1929) — here only the release half is
    // reachable, and the write half waits for the slot to go away.
    const lookup = createRouteLookup(api);
    const ownValidator = buildValidatorObject(api, lookup, defaultsWatch);
    // One branch, shared by the error path below and by `teardown`: both ask
    // the same question, so they share the site rather than each growing an
    // arm the other's test has to reach.
    const releaseIfStillOurs = () => {
      if (ctx.validator === ownValidator) {
        ctx.validator = null;
      }
    };

    ctx.validator = ownValidator;

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
      ctx.validator.options.validateOptions(
        options,
        "constructor (retrospective)",
      );

      if (typeof options.defaultRoute === "string") {
        validateConfiguredDefaultRoute(options.defaultRoute, lookup);
      }
    } catch (error) {
      releaseIfStillOurs();

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

    // ⚠ A CHECK, not a `RouterValidator` member, and the distinction is the
    // argument rather than the style: core hands this position `ownParams` —
    // the copy it will print the path from — which no seam can reach, because
    // at the call boundary that object does not exist yet (#2134 / #2388).
    //
    // ⚠ Registered AFTER the retrospective pass above, so the error path's
    // `releaseIfStillOurs` leaves nothing registered behind it.
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
    const walkRouteCallbacks = (batch: readonly Route[]): void => {
      for (const route of batch) {
        guardRouteCallbacks(route);
        guardNoAsyncCallbacks(route);

        if (route.children !== undefined) {
          walkRouteCallbacks(route.children);
        }
      }
    };

    const checkRouteBatch = (
      batch: readonly Route[],
      caller: "addRoute" | "replaceRoutes",
      parentName: string | undefined,
    ): void => {
      walkRouteCallbacks(batch);

      if (parentName !== undefined) {
        validateParentOptionRaw(parentName);

        if (!lookup.hasRoute(parentName)) {
          throw atAddRoute.ref`Parent route "${parentName}" does not exist`;
        }
      }

      throwIfInternalRouteInArray(batch, caller);
      validateAddRouteArgs(batch);
      validateRoutes(
        batch as Route[],
        api.getTree(),
        lookup,
        api.getForwardMap(),
        parentName,
      );
    };

    const removeAddRouteCheck = api.addCheck(
      "addRoute:batch",
      (batch, parentName) => {
        checkRouteBatch(batch as readonly Route[], "addRoute", parentName);
      },
    );

    const removeReplaceRoutesCheck = api.addCheck(
      "replaceRoutes:batch",
      (batch) => {
        checkRouteBatch(batch as readonly Route[], "replaceRoutes", undefined);
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

    // ⚠ A DIAGNOSTIC, not a check, and the channel is the difference rather
    // than the style: this one cannot refuse the registration it describes —
    // the plugin is already installed by the time core reports.
    const removePluginAfterStartDiagnostic = api.subscribeDiagnostic(
      "PLUGIN_AFTER_START",
      (methodName) => {
        warnPluginAfterStart(methodName, api.logger);
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

        removePluginAfterStartDiagnostic();

        removeInterceptor();

        releaseIfStillOurs();
      },
    };
  };
}
