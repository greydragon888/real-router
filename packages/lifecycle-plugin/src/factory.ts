import { getPluginApi } from "@real-router/core/api";

import type { LifecycleHook, LifecycleHookFactory } from "./types";
import type { PluginFactory, State } from "@real-router/core";

function createPlugin(
  ...args: Parameters<PluginFactory>
): ReturnType<PluginFactory> {
  const [router, getDependency] = args;
  const api = getPluginApi(router);
  const compiledHooks = new Map<
    string,
    { hook: LifecycleHook; factory: LifecycleHookFactory }
  >();

  function compileHook(
    hookName: "onEnter" | "onStay" | "onLeave" | "onNavigate",
    routeName: string,
  ): LifecycleHook | undefined {
    const key = `${hookName}:${routeName}`;
    const config = api.getRouteConfig(routeName);
    const factory =
      typeof config?.[hookName] === "function"
        ? (config[hookName] as LifecycleHookFactory)
        : undefined;

    if (!factory) {
      compiledHooks.delete(key);

      return undefined;
    }

    const cached = compiledHooks.get(key);

    if (cached?.factory === factory) {
      return cached.hook;
    }

    const hook = factory(router, getDependency);

    compiledHooks.set(key, { hook, factory });

    return hook;
  }

  return {
    onTransitionLeaveApprove: (
      toState: State,
      fromState: State | undefined,
    ) => {
      if (fromState && toState.name !== fromState.name) {
        compileHook("onLeave", fromState.name)?.(toState, fromState);
      }
    },

    onTransitionSuccess: (toState: State, fromState: State | undefined) => {
      if (toState.name === fromState?.name) {
        (
          compileHook("onStay", toState.name) ??
          compileHook("onNavigate", toState.name)
        )?.(toState, fromState);
      } else {
        (
          compileHook("onEnter", toState.name) ??
          compileHook("onNavigate", toState.name)
        )?.(toState, fromState);
      }
    },
  };
}

export function lifecyclePluginFactory(): PluginFactory {
  return createPlugin;
}
