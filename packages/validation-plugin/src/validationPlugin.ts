// packages/validation-plugin/src/validationPlugin.ts

import { RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { freezeThrownError } from "@real-router/core/utils";
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
  validateResolvedDefaultRoute,
  warnOrphanedGuards,
} from "./validators/retrospective";
import {
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
import type {
  DefaultDependencies,
  PluginFactory,
  RouterValidator,
  Route,
  RouteTree,
  Plugin,
} from "@real-router/core";
import type { RouterInternals, Matcher } from "@real-router/core/validation";

function buildValidatorObject<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  ctx: RouterInternals<Dependencies>,
  defaultsWatch: DefaultsMutationWatch,
): RouterValidator {
  return {
    routes: {
      validateBuildPathArgs,
      validateMatchPathArgs,
      validateIsActiveRouteArgs,
      validateShouldUpdateNodeArgs,
      validateStateBuilderArgs,

      validateAddRouteArgs(routes) {
        validateAddRouteArgs(routes as readonly Route[]);
      },

      validateRoutes(routes, store, parentName) {
        const typedStore = store as {
          tree?: unknown;
          matcher?: unknown;
          config?: { forwardMap?: Record<string, string> };
        };

        validateRoutes(
          routes as Route[],
          typedStore.tree as RouteTree | undefined,
          typedStore.matcher as Matcher | undefined,
          typedStore.config?.forwardMap,
          parentName,
        );
      },
      validateRemoveRouteArgs,
      validateUpdateRouteBasicArgs,
      validateUpdateRoutePropertyTypes(_name, updates) {
        const upd = updates as Record<string, unknown>;

        validateUpdateRoutePropertyTypes({
          forwardTo: upd.forwardTo,
          defaultParams: upd.defaultParams,
          defaultSearch: upd.defaultSearch,
          decodeParams: upd.decodeParams,
          encodeParams: upd.encodeParams,
          canActivate: upd.canActivate,
          canDeactivate: upd.canDeactivate,
        });
      },
      validateUpdateRoute(name, updates, store) {
        const typedStore = store as {
          matcher: {
            hasRoute: (routeName: string) => boolean;
            getSegmentsByName: (routeName: string) => unknown;
          };
          config: { forwardMap: Record<string, string> };
        };
        const forwardTo = (updates as Record<string, unknown>).forwardTo;

        validateUpdateRoute(
          name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          forwardTo as any,
          (routeName: string) => typedStore.matcher.hasRoute(routeName),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          typedStore.matcher as any,
          typedStore.config,
        );
      },
      validateParentOption(parent, tree) {
        validateParentOptionRaw(parent);
        let node = tree as { children: Map<string, unknown> };

        for (const segment of parent.split(".")) {
          const child = node.children.get(segment) as
            { children: Map<string, unknown> } | undefined;

          if (!child) {
            throw new ReferenceError(
              `[router.addRoute] Parent route "${parent}" does not exist`,
            );
          }

          node = child;
        }
      },
      validateRouteName(name, caller) {
        validateRouteName(name, caller);
      },
      throwIfInternalRoute(name, caller) {
        throwIfInternalRoute(name as string, caller);
      },

      throwIfInternalRouteInArray(routes, caller) {
        throwIfInternalRouteInArray(routes as readonly Route[], caller);
      },
      validateSetRootPathArgs,
      guardRouteCallbacks,
      guardNoAsyncCallbacks,
    },
    options: {
      validateOptions,
      validateResolvedDefaultRoute,
    },
    dependencies: {
      validateDependencyName,
      validateSetDependencyArgs(_name, _value, _caller) {
        validateSetDependencyArgsRaw(_name);
      },
      validateDependenciesObject,
      validateDependencyExists(name, store) {
        const typedStore = store as { dependencies?: Record<string, unknown> };
        const value = typedStore.dependencies?.[name];

        validateDependencyExistsRaw(value, name);
      },
      validateDependencyCount(store, methodName) {
        validateDependencyCount(store, methodName, ctx.logger);
      },
      validateCloneArgs,
      warnOverwrite(name, methodName) {
        warnDepsOverwrite(name, methodName, ctx.logger);
      },
      warnBatchOverwrite(keys, methodName) {
        warnBatchOverwrite(keys, methodName, ctx.logger);
      },
      warnRemoveNonExistent(name) {
        warnRemoveNonExistent(name, ctx.logger);
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
          ctx.getOptions().limits?.maxPlugins ?? CORE_LIMIT_DEFAULTS.maxPlugins;

        validatePluginCountThresholds(count, maxPlugins, ctx.logger);
      },
      warnBatchDuplicates() {
        warnBatchDuplicates(ctx.logger);
      },
      warnPluginMethodType(methodName) {
        warnPluginMethodType(methodName, ctx.logger);
      },
      warnPluginAfterStart(methodName) {
        warnPluginAfterStart(methodName, ctx.logger);
      },
    },
    lifecycle: {
      validateHandler,
      validateHandlerLimit(count, methodName) {
        const maxHandlers =
          ctx.getOptions().limits?.maxLifecycleHandlers ??
          CORE_LIMIT_DEFAULTS.maxLifecycleHandlers;

        validateHandlerLimit(count, methodName, maxHandlers);
      },
      validateCountThresholds(count, methodName) {
        const maxHandlers =
          ctx.getOptions().limits?.maxLifecycleHandlers ??
          CORE_LIMIT_DEFAULTS.maxLifecycleHandlers;

        validateLifecycleCountThresholds(
          count,
          methodName,
          maxHandlers,
          ctx.logger,
        );
      },
      warnOverwrite(name, type, methodName) {
        warnLifecycleOverwrite(name, type, methodName, ctx.logger);
      },
      warnAsyncGuardSync(name, methodName) {
        warnAsyncGuardSync(name, methodName, ctx.logger);
      },
    },
    navigation: {
      validateNavigateArgs,
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
        defaultsWatch.check(ctx.logger);
      },
      validateNavigateToStateArgs,
      validateNavigationOptions,
      validateParams: validateNavigateParams,
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
          throw new TypeError(
            `[router.areStatesEqual] Invalid state1: ${getTypeDescription(s1)}. Expected State object.`,
          );
        }
        if (!isState(s2)) {
          throw new TypeError(
            `[router.areStatesEqual] Invalid state2: ${getTypeDescription(s2)}. Expected State object.`,
          );
        }
        if (ignoreQP !== undefined && !isBoolean(ignoreQP)) {
          throw new TypeError(
            `[router.areStatesEqual] Invalid ignoreQueryParams: ${getTypeDescription(ignoreQP)}. Expected boolean.`,
          );
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
          ctx.getOptions().limits?.maxListeners ??
          CORE_LIMIT_DEFAULTS.maxListeners;

        validateListenerCountThresholds(
          count,
          eventName,
          methodName,
          ctx.logger,
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

    if (router.isActive()) {
      throw freezeThrownError(
        new RouterError("VALIDATION_PLUGIN_AFTER_START", {
          message: "validation-plugin must be registered before router.start()",
        }),
      );
    }

    // RouterInternals.validator is now mutable — direct assignment works
    const defaultsWatch = new DefaultsMutationWatch();

    // ⚠ BEFORE the validator goes live, so the first `navigateToDefault` after
    // this line already has a baseline to compare against.
    defaultsWatch.watch(ctx.getAdoptedOrigins());

    ctx.validator = buildValidatorObject(ctx, defaultsWatch);

    try {
      const store = ctx.routeGetStore();
      const deps = ctx.dependenciesGetStore();
      const options = ctx.getOptions();

      validateExistingRoutes(store);
      validateForwardToConsistency(store);
      validateRoutePropertiesStore(store);
      validateForwardToTargetsStore(store);
      validateDependenciesStructure(deps);
      validateLimitsConsistency(options, deps);
      ctx.validator.options.validateOptions(
        options,
        "constructor (retrospective)",
      );

      if (typeof options.defaultRoute === "string") {
        validateResolvedDefaultRoute(options.defaultRoute, store);
      }
    } catch (error) {
      ctx.validator = null;

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
    const removeInterceptor = getPluginApi(router).addInterceptor(
      "start",
      (next, path) => {
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
          warnOrphanedGuards(ctx.routeGetStore(), ctx.logger);
        } catch {
          // A broken diagnostic is not the application's problem.
        }
        /* v8 ignore stop */

        return next(path);
      },
    );

    return {
      teardown() {
        removeInterceptor();
        ctx.validator = null;
      },
    };
  };
}
