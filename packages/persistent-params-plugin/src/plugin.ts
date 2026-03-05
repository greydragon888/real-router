// packages/persistent-params-plugin/src/plugin.ts

import {
  buildQueryString,
  extractOwnParams,
  mergeParams,
  parseQueryString,
} from "./param-utils";
import { validateParamValue } from "./validation";

import type { Params, PluginApi, State, Plugin } from "@real-router/core";

export class PersistentParamsPlugin {
  readonly #api: PluginApi;
  readonly #paramNamesSet: Set<string>;
  readonly #originalRootPath: string;

  #persistentParams: Readonly<Params>;
  #removeBuildPathInterceptor: (() => void) | undefined;
  #removeForwardStateInterceptor: (() => void) | undefined;

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
  }

  getPlugin(): Plugin {
    try {
      const { basePath, queryString } = parseQueryString(
        this.#originalRootPath,
      );
      const newQueryString = buildQueryString(queryString, [
        ...this.#paramNamesSet,
      ]);

      this.#api.setRootPath(`${basePath}?${newQueryString}`);
    } /* v8 ignore start -- @preserve: defensive error wrapping for setRootPath failure */ catch (error) {
      throw new Error(
        `[@real-router/persistent-params-plugin] Failed to update root path: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } /* v8 ignore stop */

    this.#removeBuildPathInterceptor = this.#api.addInterceptor(
      "buildPath",
      (next, route, navParams) =>
        next(route, this.#withPersistentParams(navParams ?? {})),
    );

    this.#removeForwardStateInterceptor = this.#api.addInterceptor(
      "forwardState",
      (next, routeName, routeParams) => {
        const result = next(routeName, routeParams);

        return {
          ...result,
          params: this.#withPersistentParams(result.params),
        };
      },
    );

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
    try {
      this.#removeBuildPathInterceptor?.();
      this.#removeForwardStateInterceptor?.();
      this.#api.setRootPath(this.#originalRootPath);
    } /* v8 ignore start -- @preserve: defensive error logging for teardown failure */ catch (error) {
      console.error(
        "persistent-params-plugin",
        "Error during teardown:",
        error,
      );
    } /* v8 ignore stop */
  }
}
