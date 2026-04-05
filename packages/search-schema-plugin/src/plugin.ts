import { ERROR_PREFIX } from "./constants";
import { getInvalidKeys, omitKeys } from "./helpers";

import type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from "./types";
import type { Params, Plugin, Route } from "@real-router/core";
import type { PluginApi, RoutesApi } from "@real-router/core/api";

export class SearchSchemaPlugin {
  readonly #pluginApi: PluginApi;
  readonly #routesApi: RoutesApi;
  readonly #mode: "development" | "production";
  readonly #strict: boolean;
  readonly #onError:
    | ((
        routeName: string,
        params: Params,
        issues: readonly StandardSchemaV1Issue[],
      ) => Params)
    | undefined;
  readonly #removeForwardStateInterceptor: () => void;
  readonly #removeAddInterceptor: () => void;

  constructor(
    pluginApi: PluginApi,
    routesApi: RoutesApi,
    options: SearchSchemaPluginOptions,
  ) {
    this.#pluginApi = pluginApi;
    this.#routesApi = routesApi;
    this.#mode = options.mode ?? "development";
    this.#strict = options.strict ?? false;
    this.#onError = options.onError;

    this.#validateExistingDefaultParams();

    this.#removeForwardStateInterceptor = this.#pluginApi.addInterceptor(
      "forwardState",
      (next, routeName, routeParams) => {
        const result = next(routeName, routeParams);

        return this.#validateState(result);
      },
    );

    this.#removeAddInterceptor = this.#pluginApi.addInterceptor(
      "add",
      (next, routes, addOptions) => {
        next(routes, addOptions);
        this.#validateRoutesDefaultParams(routes, addOptions?.parent);
      },
    );
  }

  getPlugin(): Plugin {
    return {
      teardown: () => {
        this.#removeForwardStateInterceptor();
        this.#removeAddInterceptor();
      },
    };
  }

  #getSchema(routeName: string): StandardSchemaV1 | undefined {
    return this.#pluginApi.getRouteConfig(routeName)?.searchSchema as
      | StandardSchemaV1
      | undefined;
  }

  #validateState(result: { name: string; params: Params }): {
    name: string;
    params: Params;
  } {
    const schema = this.#getSchema(result.name);

    if (!schema) {
      return result;
    }

    const validation = schema["~standard"].validate(result.params);

    if (validation instanceof Promise) {
      throw new TypeError(
        `${ERROR_PREFIX} Async schema validation is not supported. Route "${result.name}" returned a Promise from ~standard.validate().`,
      );
    }

    if ("value" in validation) {
      const params = this.#strict
        ? (validation.value as Params)
        : { ...result.params, ...(validation.value as Params) };

      return { ...result, params };
    }

    if (this.#onError) {
      return {
        ...result,
        params: this.#onError(result.name, result.params, validation.issues),
      };
    }

    if (this.#mode === "development") {
      console.error(
        `${ERROR_PREFIX} Route "${result.name}": invalid search params`,
        validation.issues,
      );
    }

    const invalidKeys = getInvalidKeys(validation.issues);
    const stripped = omitKeys(result.params, invalidKeys);
    const route = this.#routesApi.get(result.name);
    const defaults = route?.defaultParams;
    const restored = defaults ? { ...defaults, ...stripped } : stripped;

    return { ...result, params: restored };
  }

  #validateExistingDefaultParams(): void {
    if (this.#mode !== "development") {
      return;
    }

    const tree = this.#pluginApi.getTree() as unknown as
      | { fullName?: string; children?: ReadonlyMap<string, unknown> }
      | undefined;

    /* v8 ignore next -- @preserve: getTree() always returns a RouteTree, defensive check */
    if (!tree) {
      return;
    }

    this.#walkTree(tree);
  }

  #walkTree(node: {
    fullName?: string;
    children?: ReadonlyMap<string, unknown>;
  }): void {
    if (node.fullName) {
      this.#validateSingleRouteDefaultParams(node.fullName);
    }

    /* v8 ignore next 3 -- @preserve: children is always a Map in RouteTree */
    if (node.children instanceof Map) {
      for (const child of node.children.values()) {
        if (child && typeof child === "object") {
          this.#walkTree(
            child as {
              fullName?: string;
              children?: ReadonlyMap<string, unknown>;
            },
          );
        }
      }
    }
  }

  #validateSingleRouteDefaultParams(routeName: string): void {
    const schema = this.#getSchema(routeName);

    if (!schema) {
      return;
    }

    const route = this.#routesApi.get(routeName);
    const defaultParams = route?.defaultParams;

    if (!defaultParams) {
      return;
    }

    const validation = schema["~standard"].validate(defaultParams);

    if (validation instanceof Promise) {
      return;
    }

    if ("issues" in validation) {
      console.warn(
        `${ERROR_PREFIX} Route "${routeName}": defaultParams do not pass searchSchema`,
        validation.issues,
      );
    }
  }

  #validateRoutesDefaultParams(routes: Route[], prefix = ""): void {
    if (this.#mode !== "development") {
      return;
    }

    for (const route of routes) {
      /* v8 ignore next -- @preserve: Route.name is always a non-empty string */
      if (route.name) {
        const fullName = prefix ? `${prefix}.${route.name}` : route.name;

        this.#validateSingleRouteDefaultParams(fullName);

        if (route.children) {
          this.#validateRoutesDefaultParams(route.children, fullName);
        }
      }
    }
  }
}
