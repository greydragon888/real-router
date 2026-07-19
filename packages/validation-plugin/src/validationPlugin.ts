// packages/validation-plugin/src/validationPlugin.ts

import { RouterError } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import {
  validateRouteName,
  isState,
  isBoolean,
  getTypeDescription,
} from "./type-guards";
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
  validateAddInterceptorArgs,
} from "./validators/plugins";
import {
  validateExistingRoutes,
  validateForwardToConsistency,
  validateRoutePropertiesStore,
  validateForwardToTargetsStore,
  validateDependenciesStructure,
  validateLimitsConsistency,
  validateResolvedDefaultRoute,
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
import { validateMakeStateArgs } from "./validators/state";

import type { EventName, EventMethodMap } from "./validators/eventBus";
import type {
  PluginFactory,
  RouterValidator,
  Route,
  RouteTree,
  Plugin,
} from "@real-router/core";
import type { RouterInternals, Matcher } from "@real-router/core/validation";

function buildValidatorObject(ctx: RouterInternals): RouterValidator {
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

        validateUpdateRoutePropertyTypes(
          upd.forwardTo,
          upd.defaultParams,
          upd.decodeParams,
          upd.encodeParams,
        );
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
        const maxPlugins = ctx.getOptions().limits?.maxPlugins ?? 50;

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
      validateAddInterceptorArgs,
    },
    lifecycle: {
      validateHandler,
      validateHandlerLimit(count, methodName) {
        const maxHandlers =
          ctx.getOptions().limits?.maxLifecycleHandlers ?? 200;

        validateHandlerLimit(count, methodName, maxHandlers);
      },
      validateCountThresholds(count, methodName) {
        const maxHandlers =
          ctx.getOptions().limits?.maxLifecycleHandlers ?? 200;

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
      validateNavigateToDefaultArgs,
      validateNavigateToStateArgs,
      validateNavigationOptions,
      validateParams: validateNavigateParams,
      validateStartArgs,
    },
    state: {
      validateMakeStateArgs,
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
        const maxListeners = ctx.getOptions().limits?.maxListeners ?? 10_000;

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

export function validationPlugin(): PluginFactory {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  return (router) => {
    const ctx = getInternals(router);

    if (router.isActive()) {
      throw new RouterError("VALIDATION_PLUGIN_AFTER_START", {
        message: "validation-plugin must be registered before router.start()",
      });
    }

    // RouterInternals.validator is now mutable — direct assignment works
    ctx.validator = buildValidatorObject(ctx);

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

    return {
      teardown() {
        ctx.validator = null;
      },
    };
  };
}
