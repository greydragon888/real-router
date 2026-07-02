// packages/persistent-params-plugin/src/plugin.ts

import { ERROR_PREFIX } from "./constants";
import { extractOwnParams, mergeParams } from "./param-utils";
import { validateParamValue } from "./validation";

import type { Params, State, Plugin } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export class PersistentParamsPlugin {
  readonly #api: PluginApi;
  readonly #paramNamesSet: Set<string>;
  readonly #originalRootPath: string;
  readonly #removeBuildPathInterceptor: () => void;
  readonly #removeForwardStateInterceptor: () => void;
  readonly #claim: {
    write: (state: State, value: Readonly<Params>) => void;
    release: () => void;
  };

  #persistentParams: Readonly<Params>;

  // Per-navigation removal record, valid ONLY within the synchronous
  // forwardState → buildPath window of core's `buildNavigateState`. forwardState
  // (which sees the raw `{ key: undefined }` removal marker) records the removed
  // keys here; the paired buildPath (which receives the already-forwarded params,
  // where the `undefined` marker is gone) consumes it to drop the same keys from
  // the built URL, then clears it. Never a source of permanent state — the
  // permanent removal happens in #onTransitionSuccess against the committed state.
  readonly #pendingRemovals = new Set<string>();

  constructor(
    api: PluginApi,
    persistentParams: Readonly<Params>,
    paramNamesSet: Set<string>,
    originalRootPath: string,
  ) {
    this.#api = api;
    this.#persistentParams = persistentParams;
    this.#paramNamesSet = paramNamesSet;
    this.#originalRootPath = originalRootPath;
    this.#claim = api.claimContextNamespace("persistentParams");

    let removeBuildPath: (() => void) | undefined;
    let removeForwardState: (() => void) | undefined;

    try {
      api.setRootPath(`${originalRootPath}?${[...paramNamesSet].join("&")}`);

      removeBuildPath = api.addInterceptor(
        "buildPath",
        (next, route, navParams) =>
          next(route, this.#buildPathParams(navParams ?? {})),
      );

      removeForwardState = api.addInterceptor(
        "forwardState",
        (next, routeName, routeParams) => {
          const result = next(routeName, routeParams);

          return {
            ...result,
            params: this.#forwardStateParams(result.params),
          };
        },
      );
    } /* v8 ignore start -- @preserve: rollback on partial initialization failure */ catch (error) {
      removeBuildPath?.();
      removeForwardState?.();
      api.setRootPath(originalRootPath);

      throw new Error(
        `${ERROR_PREFIX} Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } /* v8 ignore stop */

    this.#removeBuildPathInterceptor = removeBuildPath;
    this.#removeForwardStateInterceptor = removeForwardState;
  }

  getPlugin(): Plugin {
    return {
      onTransitionSuccess: (toState) => {
        this.#onTransitionSuccess(toState);
      },
      teardown: () => {
        this.#teardown();
      },
    };
  }

  // forwardState phase (runs first in buildNavigateState). Injects persistent
  // params into the target state and RECORDS — but does not commit — any removal
  // requests (`{ key: undefined }`). The removal is NOT applied to the tracked
  // set/snapshot here: this runs before the deactivation/activation guards, so a
  // rejected or cancelled transition must leave the param intact (#803). The
  // permanent removal is committed in #onTransitionSuccess against the state that
  // actually committed. `mergeParams` honors `undefined` as a delete for the
  // current transition's params.
  #forwardStateParams(additionalParams: Params): Params {
    const safeParams = extractOwnParams(additionalParams);

    // Reset the per-navigation record: forwardState opens the synchronous
    // forwardState → buildPath window that buildPath consumes.
    this.#pendingRemovals.clear();

    for (const [key, value] of Object.entries(safeParams)) {
      if (value === undefined && this.#paramNamesSet.has(key)) {
        this.#pendingRemovals.add(key);
      } else {
        validateParamValue(key, value);
      }
    }

    return mergeParams(this.#persistentParams, safeParams);
  }

  // buildPath phase (runs second in buildNavigateState, and standalone for
  // `router.buildPath()`). Injects persistent params into the URL, then drops the
  // keys the paired forwardState just removed — otherwise the freshly-removed
  // param would be re-injected into the built path from the still-unchanged
  // snapshot (the `undefined` marker is gone by the time params reach buildPath).
  // Consume-once: a standalone buildPath sees an empty set and injects normally.
  #buildPathParams(additionalParams: Params): Params {
    const safeParams = extractOwnParams(additionalParams);

    // A removal marker (`undefined`) is a valid param value, so validating it is
    // harmless — mergeParams treats it as a delete for the built path. No need to
    // special-case removal here (unlike forwardState, which must record it).
    for (const [key, value] of Object.entries(safeParams)) {
      validateParamValue(key, value);
    }

    const merged = mergeParams(this.#persistentParams, safeParams);

    if (this.#pendingRemovals.size > 0) {
      for (const key of this.#pendingRemovals) {
        delete merged[key];
      }

      this.#pendingRemovals.clear();
    }

    return merged;
  }

  #onTransitionSuccess(toState: State): void {
    let newParams: Params | undefined;

    for (const key of this.#paramNamesSet) {
      const value = toState.params[key];

      if (!Object.hasOwn(toState.params, key) || value === undefined) {
        // A tracked param is absent from the committed state — either an explicit
        // removal (`navigate({ key: undefined })`, applied as a delete by
        // mergeParams for this transition) or a state committed via navigateToState
        // (which bypasses the forwardState injection). The permanent removal is
        // committed HERE, against the state that actually committed, so a
        // rejected/cancelled transition never drops the param (#803). Only a param
        // that was really persisted (present with a defined value) is removed;
        // a still-empty tracked key stays tracked so it can persist later.
        if (
          Object.hasOwn(this.#persistentParams, key) &&
          this.#persistentParams[key] !== undefined
        ) {
          this.#paramNamesSet.delete(key);
          newParams ??= { ...this.#persistentParams };
          delete newParams[key];
        }

        continue;
      }

      validateParamValue(key, value);

      if (this.#persistentParams[key] !== value) {
        newParams ??= { ...this.#persistentParams };
        newParams[key] = value;
      }
    }

    if (newParams) {
      this.#persistentParams = Object.freeze(newParams);
    }

    this.#claim.write(toState, this.#persistentParams);
  }

  #teardown(): void {
    this.#removeBuildPathInterceptor();
    this.#removeForwardStateInterceptor();
    this.#claim.release();

    /* v8 ignore start -- @preserve: setRootPath throws RouterError(ROUTER_DISPOSED) during router.dispose() */
    try {
      this.#api.setRootPath(this.#originalRootPath);
    } catch {
      // Expected during router.dispose(): FSM enters DISPOSED before plugin teardown,
      // so setRootPath's throwIfDisposed() check throws. Restoring rootPath on a
      // destroyed router is unnecessary — swallow silently.
    }
    /* v8 ignore stop */
  }
}
