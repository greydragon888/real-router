import { ERROR_PREFIX } from "./constants";
import { getInvalidKeys, omitKeys } from "./helpers";

import type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from "./types";
import type {
  Params,
  Plugin,
  SearchParams,
  SimpleState,
  TreeChangedEvent,
} from "@real-router/core";
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
  readonly #removeChangesSubscription: () => void;

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
      (next, routeName, routeParams, routeSearch) => {
        const result = next(routeName, routeParams, routeSearch);

        // `routeSearch` defined → URL→State (matchPath): the query rides in
        // `result.search`. `undefined` → State→URL (navigate): it rides in the
        // params bag (query not yet slot-shifted). Validate whichever channel
        // holds the query (RFC-4 M2 / #1548).
        return this.#validateState(result, routeSearch !== undefined);
      },
    );

    // Dev-time defaultParams validation for runtime tree mutations. Replaces the
    // old `add` interceptor: TREE_CHANGED additionally covers `update` (changed
    // defaultParams) and `replace` (new route set) — the gap the interceptor
    // could not reach. Production mode skips the subscription entirely.
    this.#removeChangesSubscription =
      this.#mode === "development"
        ? this.#routesApi.subscribeChanges((event) => {
            this.#onTreeChanged(event);
          })
        : () => {};
  }

  getPlugin(): Plugin {
    return {
      teardown: () => {
        this.#removeForwardStateInterceptor();
        this.#removeChangesSubscription();
      },
    };
  }

  #onTreeChanged(event: TreeChangedEvent): void {
    switch (event.op) {
      case "add":
      case "replace": {
        // `added` is FLAT (full dotted names, descendants included).
        for (const route of event.added) {
          this.#validateSingleRouteDefaultParams(route.name);
        }

        break;
      }
      case "update": {
        // Only a defaultParams change can newly violate the schema.
        if (event.patch.defaultParams !== undefined) {
          this.#validateSingleRouteDefaultParams(event.name);
        }

        break;
      }
      // "remove" / "clear": the routes are gone — nothing to validate.
    }
  }

  #getSchema(routeName: string): StandardSchemaV1 | undefined {
    return this.#pluginApi.getRouteConfig(routeName)?.searchSchema as
      StandardSchemaV1 | undefined;
  }

  #validateState(result: SimpleState, useSearch: boolean): SimpleState {
    const schema = this.#getSchema(result.name);

    if (!schema) {
      return result;
    }

    // The query channel to validate: `state.search` on the URL→State (matchPath)
    // path where the query is already slot-shifted, else the params bag on the
    // State→URL (navigate) path (RFC-4 M2 / #1548). `writeBack` returns the
    // result with the validated values in whichever channel was read.
    const channel = (useSearch ? result.search : result.params) as Params;
    const writeBack = (validated: Params): SimpleState =>
      useSearch
        ? { ...result, search: validated as SearchParams }
        : { ...result, params: validated };

    const validation = schema["~standard"].validate(channel);

    if (validation instanceof Promise) {
      throw new TypeError(
        `${ERROR_PREFIX} Async schema validation is not supported. Route "${result.name}" returned a Promise from ~standard.validate().`,
      );
    }

    if ("value" in validation) {
      return writeBack(
        this.#strict
          ? (validation.value as Params)
          : { ...channel, ...(validation.value as Params) },
      );
    }

    if (this.#onError) {
      return writeBack(this.#onError(result.name, channel, validation.issues));
    }

    if (this.#mode === "development") {
      console.error(
        `${ERROR_PREFIX} Route "${result.name}": invalid search params`,
        validation.issues,
      );
    }

    const invalidKeys = getInvalidKeys(validation.issues);
    const stripped = omitKeys(channel, invalidKeys);
    const route = this.#routesApi.get(result.name);
    const defaults = route?.defaultParams;
    const restored = defaults ? { ...defaults, ...stripped } : stripped;

    return writeBack(restored);
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
      // The plugin gates invalid user *input*, not developer *config*: core
      // injects `defaultParams` into `state.params` / `state.path` below the
      // interceptor seam this plugin hooks, so an invalid default reaches state
      // and the URL at runtime regardless of this warning (documented contract,
      // #802). Hence the message states the consequence + the fix, rather than
      // implying the value was blocked.
      console.warn(
        `${ERROR_PREFIX} Route "${routeName}": defaultParams do not pass searchSchema — they are trusted config and will still reach state and the URL at runtime (the plugin validates user input, not config). Fix the route's defaultParams to satisfy its searchSchema.`,
        validation.issues,
      );
    }
  }
}
