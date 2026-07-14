import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { LifecycleHook, LifecycleHookFactory } from "./types";
import type { PluginFactory, State, TreeChangedEvent } from "@real-router/core";

const HOOK_NAMES = ["onEnter", "onStay", "onLeave", "onNavigate"] as const;

function createPlugin(
  ...args: Parameters<PluginFactory>
): ReturnType<PluginFactory> {
  const [router, getDependency] = args;
  const api = getPluginApi(router);
  const compiledHooks = new Map<
    string,
    { hook: LifecycleHook; factory: LifecycleHookFactory }
  >();

  // Drop compiled hooks for routes removed from the tree. `compileHook` can
  // never reach them again (no navigation to a removed route), so the entries
  // would be dead memory until teardown. `add`/`update` need no handling —
  // `compileHook` already revalidates lazily via the cached `factory` reference.
  const forgetRoute = (routeName: string): void => {
    for (const hookName of HOOK_NAMES) {
      compiledHooks.delete(`${hookName}:${routeName}`);
    }
  };

  const onTreeChanged = (event: TreeChangedEvent): void => {
    switch (event.op) {
      case "remove": {
        for (const route of event.removedSubtree) {
          forgetRoute(route.name);
        }

        break;
      }
      case "replace": {
        for (const route of event.removed) {
          forgetRoute(route.name);
        }

        break;
      }
      case "clear": {
        compiledHooks.clear();

        break;
      }
      // "add" / "update": lazy factory-reference revalidation handles these.
    }
  };

  const removeChangesSubscription =
    getRoutesApi(router).subscribeChanges(onTreeChanged);

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

  // Compile AND invoke a hook with per-hook exception isolation. A throwing hook
  // must not abort the handler before a *later* hook of the same transition
  // runs — otherwise a throwing onEnter/onStay silently swallows onNavigate,
  // breaking the onNavigate orthogonality invariant (#798). `compileHook` lives
  // INSIDE the try (#1222): a throwing hook FACTORY (the common DI-init shape) is
  // one seam earlier than a throwing hook body, but must be isolated identically.
  // Passing a pre-compiled hook as the argument would evaluate `compileHook` (and
  // its factory) BEFORE the try is entered, leaking the compile-throw — the
  // `isolate(produce())` anti-pattern. Mirrors the per-listener isolation in
  // `BaseSource` / `createActiveNameSelector` (@real-router/sources): re-throw
  // asynchronously via `queueMicrotask` so the developer signal still surfaces to
  // global error handlers / test harnesses without aborting the sync dispatch.
  function runHook(
    hookName: "onEnter" | "onStay" | "onLeave" | "onNavigate",
    routeName: string,
    toState: State,
    fromState: State | undefined,
  ): void {
    try {
      compileHook(hookName, routeName)?.(toState, fromState);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }

  return {
    onTransitionLeaveApprove: (
      toState: State,
      fromState: State | undefined,
    ) => {
      if (fromState && toState.name !== fromState.name) {
        runHook("onLeave", fromState.name, toState, fromState);
      }
    },

    onTransitionSuccess: (toState: State, fromState: State | undefined) => {
      if (toState.name === fromState?.name) {
        runHook("onStay", toState.name, toState, fromState);
      } else {
        runHook("onEnter", toState.name, toState, fromState);
      }

      runHook("onNavigate", toState.name, toState, fromState);
    },

    teardown: () => {
      removeChangesSubscription();
    },
  };
}

export function lifecyclePluginFactory(): PluginFactory {
  return createPlugin;
}
