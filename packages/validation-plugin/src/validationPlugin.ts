// packages/validation-plugin/src/validationPlugin.ts

import { RouterError } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import {
  validateRouteName,
  isState,
  isBoolean,
  getTypeDescription,
} from "type-guards";

import * as depsV from "./validators/dependencies";
import * as eventBusV from "./validators/eventBus";
import * as lifecycleV from "./validators/lifecycle";
import * as navV from "./validators/navigation";
import * as optionsV from "./validators/options";
import * as pluginsV from "./validators/plugins";
import * as retroV from "./validators/retrospective";
import * as routesV from "./validators/routes";
import * as stateV from "./validators/state";

import type { PluginFactory, RouterValidator } from "@real-router/core";
import type { RouterInternals } from "@real-router/core/validation";

function buildValidatorObject(ctx: RouterInternals): RouterValidator {
  return {
    routes: {
      validateBuildPathArgs: routesV.validateBuildPathArgs,
      validateMatchPathArgs: routesV.validateMatchPathArgs,
      validateIsActiveRouteArgs: routesV.validateIsActiveRouteArgs,
      validateShouldUpdateNodeArgs: routesV.validateShouldUpdateNodeArgs,
      validateStateBuilderArgs: routesV.validateStateBuilderArgs,

      validateAddRouteArgs(routes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        routesV.validateAddRouteArgs(routes as any);
      },

      validateRoutes(routes, store) {
        const s = store as {
          tree?: unknown;
          config?: { forwardMap?: Record<string, string> };
        };

        routesV.validateRoutes(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          routes as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          s.tree as any,
          s.config?.forwardMap,
        );
      },
      validateRemoveRouteArgs: routesV.validateRemoveRouteArgs,
      validateUpdateRouteBasicArgs: routesV.validateUpdateRouteBasicArgs,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      validateUpdateRoutePropertyTypes(_name, _updates) {},
      validateUpdateRoute(name, updates, store) {
        const s = store as {
          matcher: {
            hasRoute: (n: string) => boolean;
            getSegmentsByName: (n: string) => unknown;
          };
          config: { forwardMap: Record<string, string> };
        };
        const forwardTo = (updates as Record<string, unknown>).forwardTo;

        routesV.validateUpdateRoute(
          name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          forwardTo as any,
          (n: string) => s.matcher.hasRoute(n),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          s.matcher as any,
          s.config,
        );
      },
      validateParentOption(parent, tree) {
        routesV.validateParentOption(parent as string);
        let node = tree as { children: Map<string, unknown> };

        for (const segment of (parent as string).split(".")) {
          const child = node.children.get(segment) as
            | { children: Map<string, unknown> }
            | undefined;

          if (!child) {
            throw new Error(
              `[router.addRoute] Parent route "${parent as string}" does not exist`,
            );
          }

          node = child;
        }
      },
      validateRouteName(name, caller) {
        validateRouteName(name, caller);
      },
      throwIfInternalRoute(name, caller) {
        routesV.throwIfInternalRoute(name as string, caller);
      },

      throwIfInternalRouteInArray(routes, caller) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        routesV.throwIfInternalRouteInArray(routes as any, caller);
      },
      validateExistingRoutes: retroV.validateExistingRoutes,
      validateForwardToConsistency: retroV.validateForwardToConsistency,
      validateSetRootPathArgs: routesV.validateSetRootPathArgs,
      guardRouteCallbacks: routesV.guardRouteCallbacks,
      guardNoAsyncCallbacks: routesV.guardNoAsyncCallbacks,
    },
    options: {
      validateLimitValue(name, value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        optionsV.validateLimitValue(name as any, value, "validate");
      },
      validateLimits(limits) {
        optionsV.validateLimits(limits, "validate");
      },
      validateOptions: optionsV.validateOptions,
    },
    dependencies: {
      validateDependencyName: depsV.validateDependencyName,
      validateSetDependencyArgs(_name, _value, _caller) {
        depsV.validateSetDependencyArgs(_name);
      },
      validateDependenciesObject: depsV.validateDependenciesObject,
      validateDependencyExists(name, store) {
        const s = store as { dependencies?: Record<string, unknown> };
        const value = s.dependencies?.[name];

        depsV.validateDependencyExists(value, name);
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      validateDependencyLimit(_store, _limits) {},
      validateDependenciesStructure: retroV.validateDependenciesStructure,
      validateDependencyCount: depsV.validateDependencyCount,
      validateCloneArgs: depsV.validateCloneArgs,
      warnOverwrite: depsV.warnOverwrite,
      warnBatchOverwrite: depsV.warnBatchOverwrite,
      warnRemoveNonExistent: depsV.warnRemoveNonExistent,
    },
    plugins: {
      validatePluginLimit(count, limits) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        pluginsV.validatePluginLimit(count, 1, (limits as any)?.maxPlugins);
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      validateNoDuplicatePlugins(_factory, _factories) {},
      validatePluginKeys: pluginsV.validatePluginKeys,
      validateCountThresholds(count) {
        const maxPlugins = ctx.getOptions().limits?.maxPlugins ?? 50;

        pluginsV.validateCountThresholds(count, maxPlugins);
      },
      warnBatchDuplicates(_plugins) {
        pluginsV.warnBatchDuplicates();
      },
      warnPluginMethodType: pluginsV.warnPluginMethodType,
      warnPluginAfterStart: pluginsV.warnPluginAfterStart,
    },
    lifecycle: {
      validateHandler: lifecycleV.validateHandler,
      validateNotRegistering(name, _guards, caller) {
        lifecycleV.validateNotRegistering(false, name, caller);
      },
      validateHandlerLimit(count, limits, caller) {
        lifecycleV.validateHandlerLimit(
          count,
          caller,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          (limits as any)?.maxLifecycleHandlers,
        );
      },
      validateCountThresholds(count, methodName) {
        const maxHandlers =
          ctx.getOptions().limits?.maxLifecycleHandlers ?? 200;

        lifecycleV.validateLifecycleCountThresholds(
          count,
          methodName,
          maxHandlers,
        );
      },
      warnOverwrite: lifecycleV.warnOverwrite,
      warnAsyncGuardSync: lifecycleV.warnAsyncGuardSync,
    },
    navigation: {
      validateNavigateArgs: navV.validateNavigateArgs,
      validateNavigateToDefaultArgs: navV.validateNavigateToDefaultArgs,
      validateNavigationOptions: navV.validateNavigationOptions,
    },
    state: {
      validateMakeStateArgs: stateV.validateMakeStateArgs,
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
      validateEventName: eventBusV.validateEventName,

      validateListenerArgs(name, cb) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventBusV.validateListenerArgs(name as any, cb as any);
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

    const validator = buildValidatorObject(ctx);

    // RouterInternals.validator is now mutable — direct assignment works
    ctx.validator = validator;

    try {
      const store = ctx.routeGetStore();
      const deps = ctx.dependenciesGetStore();
      const options = ctx.getOptions();

      retroV.validateExistingRoutes(store);
      retroV.validateForwardToConsistency(store);
      retroV.validateRoutePropertiesStore(store);
      retroV.validateForwardToTargetsStore(store);
      retroV.validateDependenciesStructure(deps);
      retroV.validateLimitsConsistency(options, store, deps);
      validator.options.validateOptions(
        options as unknown,
        "constructor (retrospective)",
      );
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
