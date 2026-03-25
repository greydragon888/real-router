// packages/validation-plugin/src/validationPlugin.ts

import { RouterError } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import type { PluginFactory, RouterValidator } from "@real-router/core";

import {
  validateRouteName,
  isState,
  isBoolean,
  getTypeDescription,
} from "type-guards";

import * as routesV from "./validators/routes";
import * as optionsV from "./validators/options";
import * as depsV from "./validators/dependencies";
import * as lifecycleV from "./validators/lifecycle";
import * as navV from "./validators/navigation";
import * as stateV from "./validators/state";
import * as retroV from "./validators/retrospective";
import * as pluginsV from "./validators/plugins";
import * as eventBusV from "./validators/eventBus";

function buildValidatorObject(): RouterValidator {
  return {
    routes: {
      validateBuildPathArgs: routesV.validateBuildPathArgs,
      validateMatchPathArgs: routesV.validateMatchPathArgs,
      validateIsActiveRouteArgs: routesV.validateIsActiveRouteArgs,
      validateShouldUpdateNodeArgs: routesV.validateShouldUpdateNodeArgs,
      validateStateBuilderArgs: routesV.validateStateBuilderArgs,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateAddRouteArgs(routes) {
        routesV.validateAddRouteArgs(routes as any);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateRoutes(routes, store) {
        const s = store as {
          tree?: unknown;
          config?: { forwardMap?: Record<string, string> };
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        routesV.validateRoutes(
          routes as any,
          s.tree as any,
          s.config?.forwardMap,
        );
      },
      validateRemoveRouteArgs: routesV.validateRemoveRouteArgs,
      validateUpdateRouteBasicArgs: routesV.validateUpdateRouteBasicArgs,
      validateUpdateRoutePropertyTypes(_name, _updates) {},
      validateUpdateRoute(_name, _updates, _tree) {},
      validateParentOption: routesV.validateParentOption,
      validateRouteName(name, caller) {
        validateRouteName(name, caller);
      },
      throwIfInternalRoute: routesV.throwIfInternalRoute,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throwIfInternalRouteInArray(routes, caller) {
        routesV.throwIfInternalRouteInArray(routes as any, caller);
      },
      validateExistingRoutes: retroV.validateExistingRoutes,
      validateForwardToConsistency: retroV.validateForwardToConsistency,
    },
    options: {
      validateLimitValue(name, value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        optionsV.validateLimitValue(name as any, value, "validate");
      },
      validateLimits(limits) {
        optionsV.validateLimits(limits, "validate");
      },
    },
    dependencies: {
      validateDependencyName: depsV.validateDependencyName,
      validateSetDependencyArgs(_name, _value, _caller) {
        depsV.validateSetDependencyArgs(_name);
      },
      validateDependenciesObject: depsV.validateDependenciesObject,
      validateDependencyExists(value, name) {
        depsV.validateDependencyExists(value, name as string);
      },
      validateDependencyLimit(_store, _limits) {},
      validateDependenciesStructure: retroV.validateDependenciesStructure,
    },
    plugins: {
      validatePluginLimit(count, limits) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pluginsV.validatePluginLimit(count, 1, (limits as any)?.maxPlugins);
      },
      validateNoDuplicatePlugins(_factory, _factories) {},
    },
    lifecycle: {
      validateHandler: lifecycleV.validateHandler,
      validateNotRegistering(name, _guards, caller) {
        lifecycleV.validateNotRegistering(false, name, caller);
      },
      validateHandlerLimit(count, limits, caller) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lifecycleV.validateHandlerLimit(
          count,
          caller,
          (limits as any)?.maxLifecycleHandlers,
        );
      },
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
      validateListenerArgs: eventBusV.validateListenerArgs,
    },
  };
}

export function validationPlugin(): PluginFactory {
  return (router) => {
    const ctx = getInternals(router);

    if (router.isActive()) {
      throw new RouterError("VALIDATION_PLUGIN_AFTER_START", {
        message: "validation-plugin must be registered before router.start()",
      });
    }

    const validator = buildValidatorObject();

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
