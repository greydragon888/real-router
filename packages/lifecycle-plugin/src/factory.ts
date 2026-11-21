import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { LifecycleHook, LifecycleHookFactory } from "./types";
import type { PluginFactory, State, TreeChangedEvent } from "@real-router/core";

const HOOK_NAMES = ["onEnter", "onStay", "onLeave", "onNavigate"] as const;

type HookName = (typeof HOOK_NAMES)[number];

/** The context of the messages this plugin logs through the router's logger. */
const LOGGER_CONTEXT = "lifecycle-plugin";

/**
 * The hook's own abort: a rejection with the reason of the signal it was
 * handed, or with that reason as its `cause` — one level, as `setTimeout` of
 * `node:timers/promises` and `events.once` reject. Before the signal aborts
 * its `reason` is `undefined`, which a bare `Promise.reject()` and an error
 * without a `cause` both match, so `signal.aborted` is checked first.
 */
function isOwnAbort(reason: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted &&
    (reason === signal.reason || causeOf(reason) === signal.reason)
  );
}

/**
 * The `cause` of a rejection reason. A read that throws gives `undefined`,
 * which no aborted signal's `reason` is, so the rejection is reported rather
 * than thrown out of the plugin's handler.
 */
function causeOf(reason: unknown): unknown {
  try {
    return (reason as { cause?: unknown } | null | undefined)?.cause;
  } catch {
    return undefined;
  }
}

/**
 * Reads what a hook returned. A thenable — a promise of any realm, or any
 * object with a callable `then` — is settled into a promise the plugin holds,
 * and its rejection goes to `report` unless it is the hook's own abort. A
 * `then` that throws on its read throws out of this call.
 */
function readReturned(
  value: unknown,
  signal: AbortSignal,
  report: (error: unknown) => void,
): void {
  const then: unknown = (value as { then?: unknown } | null | undefined)?.then;

  if (typeof then !== "function") {
    return;
  }

  new Promise<unknown>((resolve, reject) => {
    Reflect.apply(then as (...args: unknown[]) => unknown, value, [
      resolve,
      reject,
    ]);
  }).catch((error: unknown) => {
    if (!isOwnAbort(error, signal)) {
      report(error);
    }
  });
}

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

  // The signals the hooks are handed (#2692): `onEnter` gets `routeController`'s,
  // aborted when its route is left; `onStay`, `onNavigate` and `onLeave` get
  // `commitController`'s, aborted by the next commit. A controller is opened by
  // the first hook handed its signal, so a commit that runs no hook opens none.
  let routeController: AbortController | undefined;
  let commitController: AbortController | undefined;
  // Set by `stop()` and teardown, cleared by the next commit. A hook may stop
  // the router or remove the plugin, and the hooks after it in the same commit
  // still run — the controller they open is born aborted.
  let ended = false;

  const open = (): AbortController => {
    const controller = new AbortController();

    if (ended) {
      controller.abort();
    }

    return controller;
  };
  // `onEnter` is its only taker, and the leave branch empties the slot first.
  const routeSignal = (): AbortSignal => {
    routeController = open();

    return routeController.signal;
  };
  const commitSignal = (): AbortSignal => {
    commitController ??= open();

    return commitController.signal;
  };

  const endCommit = (): void => {
    commitController?.abort();
    commitController = undefined;
  };
  // Emptying the slot drops the plugin's reference to the aborted controller,
  // and to the listeners the hooks hung on its signal.
  const endRoute = (): void => {
    routeController?.abort();
    routeController = undefined;
  };
  const end = (): void => {
    ended = true;
    endCommit();
    endRoute();
  };

  function compileHook(
    hookName: HookName,
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

  // A hook's failure goes to the router's logger (#2975), the sink core's
  // listener errors take: the throw of its factory or body, and the rejection
  // of the thenable it returned.
  const report = (
    hookName: HookName,
    routeName: string,
    error: unknown,
  ): void => {
    api.logger.error(
      LOGGER_CONTEXT,
      `Error in ${hookName} hook of route "${routeName}":`,
      error,
    );
  };

  // Compile AND invoke a hook with per-hook exception isolation. A throwing hook
  // must not abort the handler before a *later* hook of the same transition
  // runs — otherwise a throwing onLeave, onEnter or onStay silently swallows the
  // hooks after it, onNavigate among them, breaking the onNavigate
  // orthogonality invariant (#798). `compileHook` lives
  // INSIDE the try (#1222): a throwing hook FACTORY (the common DI-init shape) is
  // one seam earlier than a throwing hook body, but must be isolated identically.
  // Passing a pre-compiled hook as the argument would evaluate `compileHook` (and
  // its factory) BEFORE the try is entered, leaking the compile-throw — the
  // `isolate(produce())` anti-pattern. `signal()` runs after the hook is
  // found, so it opens a controller only for a route that carries the hook.
  function runHook(
    hookName: HookName,
    routeName: string,
    toState: State,
    fromState: State | undefined,
    signal: () => AbortSignal,
  ): void {
    try {
      const hook = compileHook(hookName, routeName);

      if (!hook) {
        return;
      }

      const handed = signal();

      readReturned(hook(toState, fromState, handed), handed, (error) => {
        report(hookName, routeName, error);
      });
    } catch (error) {
      report(hookName, routeName, error);
    }
  }

  return {
    // Every hook runs on the commit (#2691): leave-approve is tentative — an
    // activation guard can still refuse, or the navigation be cancelled — and
    // a navigation that does not commit leaves the user on the route.
    // A commit ends the previous one's signals before any of its hooks runs.
    onTransitionSuccess: (toState: State, fromState: State | undefined) => {
      ended = false;
      endCommit();

      if (toState.name === fromState?.name) {
        runHook("onStay", toState.name, toState, fromState, commitSignal);
      } else {
        endRoute();

        if (fromState) {
          runHook("onLeave", fromState.name, toState, fromState, commitSignal);
        }

        runHook("onEnter", toState.name, toState, fromState, routeSignal);
      }

      runHook("onNavigate", toState.name, toState, fromState, commitSignal);
    },

    onStop: end,

    teardown: () => {
      removeChangesSubscription();
      end();
    },
  };
}

export function lifecyclePluginFactory(): PluginFactory {
  return createPlugin;
}
