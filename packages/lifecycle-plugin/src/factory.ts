import { getPluginApi } from "@real-router/core/api";

import type { LifecycleHook } from "./types";
import type { PluginFactory, State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

function createInvokeHook(api: PluginApi) {
  return (
    hookName: "onEnter" | "onStay" | "onLeave",
    routeName: string,
    toState: State,
    fromState: State | undefined,
  ): void => {
    const hook = api.getRouteConfig(routeName)?.[hookName];

    if (typeof hook === "function") {
      (hook as LifecycleHook)(toState, fromState);
    }
  };
}

function createPlugin(router: Parameters<PluginFactory>[0]) {
  const invokeHook = createInvokeHook(getPluginApi(router));

  return {
    onTransitionLeaveApprove: (
      toState: State,
      fromState: State | undefined,
    ) => {
      if (fromState && toState.name !== fromState.name) {
        invokeHook("onLeave", fromState.name, toState, fromState);
      }
    },

    onTransitionSuccess: (toState: State, fromState: State | undefined) => {
      if (toState.name === fromState?.name) {
        invokeHook("onStay", toState.name, toState, fromState);
      } else {
        invokeHook("onEnter", toState.name, toState, fromState);
      }
    },
  };
}

export function lifecyclePluginFactory(): PluginFactory {
  return createPlugin;
}
