// packages/validation-plugin/src/validationPlugin.ts

import { RouterError } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import {
  validateRouteName,
  isState,
  isBoolean,
  getTypeDescription,
} from "type-guards";

import {
  validateDependencyName,
  validateSetDependencyArgs as validateSetDependencyArgsRaw,
  validateDependenciesObject,
  validateDependencyExists as validateDependencyExistsRaw,
} from "./validators/dependencies";
import { validateEventName, validateListenerArgs } from "./validators/eventBus";
import {
  validateHandler,
  validateNotRegistering,
  validateHandlerLimit,
} from "./validators/lifecycle";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigationOptions,
} from "./validators/navigation";
import { validateLimitValue, validateLimits } from "./validators/options";
import { validatePluginLimit } from "./validators/plugins";
import {
  validateExistingRoutes,
  validateForwardToConsistency,
  validateRoutePropertiesStore,
  validateForwardToTargetsStore,
  validateDependenciesStructure,
  validateLimitsConsistency,
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
  validateUpdateRoute,
  validateParentOption as validateParentOptionRaw,
  throwIfInternalRoute,
  throwIfInternalRouteInArray,
} from "./validators/routes";
import { validateMakeStateArgs } from "./validators/state";

import type { PluginFactory, RouterValidator } from "@real-router/core";

function buildValidatorObject(): RouterValidator {
  return {
    routes: {
      validateBuildPathArgs,
      validateMatchPathArgs,
      validateIsActiveRouteArgs,
      validateShouldUpdateNodeArgs,
      validateStateBuilderArgs,

      validateAddRouteArgs(routes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        validateAddRouteArgs(routes as any);
      },

      validateRoutes(routes, store) {
        const s = store as {
          tree?: unknown;
          config?: { forwardMap?: Record<string, string> };
        };

        validateRoutes(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          routes as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          s.tree as any,
          s.config?.forwardMap,
        );
      },
      validateRemoveRouteArgs,
      validateUpdateRouteBasicArgs,
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

        validateUpdateRoute(
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
        validateParentOptionRaw(parent as string);
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
        throwIfInternalRoute(name as string, caller);
      },

      throwIfInternalRouteInArray(routes, caller) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        throwIfInternalRouteInArray(routes as any, caller);
      },
      validateExistingRoutes,
      validateForwardToConsistency,
    },
    options: {
      validateLimitValue(name, value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        validateLimitValue(name as any, value, "validate");
      },
      validateLimits(limits) {
        validateLimits(limits, "validate");
      },
    },
    dependencies: {
      validateDependencyName,
      validateSetDependencyArgs(_name, _value, _caller) {
        validateSetDependencyArgsRaw(_name);
      },
      validateDependenciesObject,
      validateDependencyExists(name, store) {
        const s = store as { dependencies?: Record<string, unknown> };
        const value = s.dependencies?.[name];

        validateDependencyExistsRaw(value, name);
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      validateDependencyLimit(_store, _limits) {},
      validateDependenciesStructure,
    },
    plugins: {
      validatePluginLimit(count, limits) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        validatePluginLimit(count, 1, (limits as any)?.maxPlugins);
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      validateNoDuplicatePlugins(_factory, _factories) {},
    },
    lifecycle: {
      validateHandler,
      validateNotRegistering(name, _guards, caller) {
        validateNotRegistering(false, name, caller);
      },
      validateHandlerLimit(count, limits, caller) {
        validateHandlerLimit(
          count,
          caller,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          (limits as any)?.maxLifecycleHandlers,
        );
      },
    },
    navigation: {
      validateNavigateArgs,
      validateNavigateToDefaultArgs,
      validateNavigationOptions,
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
      validateEventName,

      validateListenerArgs(name, cb) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validateListenerArgs(name as any, cb as any);
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
    ctx.validator = buildValidatorObject();

    try {
      const store = ctx.routeGetStore();
      const deps = ctx.dependenciesGetStore();
      const options = ctx.getOptions();

      validateExistingRoutes(store);
      validateForwardToConsistency(store);
      validateRoutePropertiesStore(store);
      validateForwardToTargetsStore(store);
      validateDependenciesStructure(deps);
      validateLimitsConsistency(options, store, deps);
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
