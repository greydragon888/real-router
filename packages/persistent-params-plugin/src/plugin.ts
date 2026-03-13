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

  #persistentParams: Readonly<Params>;

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

    let removeBuildPath: (() => void) | undefined;
    let removeForwardState: (() => void) | undefined;

    try {
      api.setRootPath(`${originalRootPath}?${[...paramNamesSet].join("&")}`);

      removeBuildPath = api.addInterceptor(
        "buildPath",
        (next, route, navParams) =>
          next(route, this.#withPersistentParams(navParams ?? {})),
      );

      removeForwardState = api.addInterceptor(
        "forwardState",
        (next, routeName, routeParams) => {
          const result = next(routeName, routeParams);

          return {
            ...result,
            params: this.#withPersistentParams(result.params),
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

  #withPersistentParams(additionalParams: Params): Params {
    const safeParams = extractOwnParams(additionalParams);
    let newParams: Params | undefined;

    for (const key of Object.keys(safeParams)) {
      const value = safeParams[key];

      if (value === undefined && this.#paramNamesSet.has(key)) {
        this.#paramNamesSet.delete(key);
        newParams ??= { ...this.#persistentParams };
        delete newParams[key];
      } else {
        validateParamValue(key, value);
      }
    }

    if (newParams) {
      this.#persistentParams = Object.freeze(newParams);
    }

    return mergeParams(this.#persistentParams, safeParams);
  }

  #onTransitionSuccess(toState: State): void {
    let newParams: Params | undefined;

    for (const key of this.#paramNamesSet) {
      const value = toState.params[key];

      if (!Object.hasOwn(toState.params, key) || value === undefined) {
        /* v8 ignore next 4 -- @preserve: defensive removal for states committed via navigateToState bypassing forwardState */
        if (
          Object.hasOwn(this.#persistentParams, key) &&
          this.#persistentParams[key] !== undefined
        ) {
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
  }

  #teardown(): void {
    this.#removeBuildPathInterceptor();
    this.#removeForwardStateInterceptor();

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
