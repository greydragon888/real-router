import { ERROR_PREFIX } from "./constants";
import { collectPathParams, getInvalidKeys, omitKeys } from "./helpers";

import type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from "./types";
import type {
  Params,
  Plugin,
  RouteTree,
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
  readonly #pathParamsCache = new Map<string, ReadonlySet<string>>();

  #cachedTree: RouteTree | undefined;

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
      (next, routeName, routeParams, routeSearch) =>
        // ONE rule for both directions (#1564): the schema governs the QUERY
        // channel, which is `result.search` plus whatever a v1 single-bag
        // caller left in the params bag — everything there that is not a path
        // slot. Deriving it from the call shape (`routeSearch !== undefined`)
        // asked a different question and got both directions half-wrong.
        this.#validateState(next(routeName, routeParams, routeSearch)),
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
          this.#validateSingleRouteDefaultSearch(route.name);
        }

        break;
      }
      case "update": {
        // Only a defaultSearch change can newly violate the schema — the schema
        // validates the query channel; defaultParams is path/arbitrary (#1548).
        if (event.patch.defaultSearch !== undefined) {
          this.#validateSingleRouteDefaultSearch(event.name);
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

  #validateState(result: SimpleState): SimpleState {
    const schema = this.#getSchema(result.name);

    if (!schema) {
      return result;
    }

    // The route's PATH slots — the one thing the schema must never see or
    // rewrite. Everything else the state carries is the query channel, whether
    // it rides in `search` (canonical, and where an inner interceptor injects)
    // or in the params bag (a v1 single-bag caller). `search` wins a twin,
    // mirroring core's own separation precedence (#843).
    const pathParams = this.#pathParams(result.name);
    const channel = {
      ...omitKeys(result.params, pathParams),
      ...result.search,
    } as Params;

    const validation = schema["~standard"].validate(channel);

    if (validation instanceof Promise) {
      throw new TypeError(
        `${ERROR_PREFIX} Async schema validation is not supported. Route "${result.name}" returned a Promise from ~standard.validate().`,
      );
    }

    if ("value" in validation) {
      return this.#writeBack(
        result,
        pathParams,
        this.#strict
          ? (validation.value as Params)
          : { ...channel, ...(validation.value as Params) },
      );
    }

    if (this.#onError) {
      return this.#writeBack(
        result,
        pathParams,
        this.#onError(result.name, channel, validation.issues),
      );
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
    // Recovery fills from the route's query-channel defaults. `defaultSearch`
    // is the M2 home (#1549); a `defaultParams` entry still reaches the query
    // channel for a declared query key (core merges it below the user channel
    // and separates afterwards), so it is honoured too — minus the path slots,
    // which are core's business, not the schema's.
    const defaults = {
      ...omitKeys(route?.defaultParams ?? {}, pathParams),
      ...((route?.defaultSearch ?? {}) as Params),
    };
    const restored = { ...defaults, ...stripped };

    return this.#writeBack(result, pathParams, restored);
  }

  /**
   * Puts the validated query back where it came from: a key stays in the bag(s)
   * that carried it, a key the schema invented lands in `search` (a schema
   * output is a query value by definition), and a key the schema dropped
   * (strict mode, or an unrecoverable issue) is removed from both. Path slots
   * are copied through untouched — they were never part of the input.
   */
  #writeBack(
    result: SimpleState,
    pathParams: ReadonlySet<string>,
    validated: Params,
  ): SimpleState {
    const params: Params = {};

    for (const [key, value] of Object.entries(result.params)) {
      if (pathParams.has(key)) {
        params[key] = value;
      } else if (Object.hasOwn(validated, key)) {
        params[key] = validated[key];
      }
    }

    const search: Params = {};

    for (const [key, value] of Object.entries(validated)) {
      const wentToParams =
        Object.hasOwn(result.params, key) && !pathParams.has(key);

      if (!wentToParams || Object.hasOwn(result.search, key)) {
        search[key] = value;
      }
    }

    return { ...result, params, search: search as SearchParams };
  }

  /**
   * Path-slot names per route, cached against the tree identity. Every mutation
   * that can change a path rebuilds the tree object (`add` / `remove` /
   * `replace` / `clear` / `setRootPath` — verified), and the one that patches in
   * place (`update`) cannot touch `path`/`children`, so a reference compare is a
   * complete invalidation check. No TREE_CHANGED subscription: a permanent
   * internal listener would force core's listener-gated O(N) mutation diff to
   * run on every tree change forever (#723).
   */
  #pathParams(routeName: string): ReadonlySet<string> {
    const tree = this.#pluginApi.getTree();

    if (tree !== this.#cachedTree) {
      this.#cachedTree = tree;
      this.#pathParamsCache.clear();
    }

    const cached = this.#pathParamsCache.get(routeName);

    if (cached) {
      return cached;
    }

    const pathParams = collectPathParams(tree, routeName);

    this.#pathParamsCache.set(routeName, pathParams);

    return pathParams;
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
      this.#validateSingleRouteDefaultSearch(node.fullName);
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

  #validateSingleRouteDefaultSearch(routeName: string): void {
    const schema = this.#getSchema(routeName);

    if (!schema) {
      return;
    }

    const route = this.#routesApi.get(routeName);
    const defaultSearch = route?.defaultSearch;

    if (!defaultSearch) {
      return;
    }

    const validation = schema["~standard"].validate(defaultSearch);

    if (validation instanceof Promise) {
      return;
    }

    if ("issues" in validation) {
      // The plugin gates invalid user *input*, not developer *config*: core
      // injects `defaultSearch` into `state.search` / `state.path` below the
      // interceptor seam this plugin hooks, so an invalid default reaches state
      // and the URL at runtime regardless of this warning (documented contract,
      // #802). Hence the message states the consequence + the fix, rather than
      // implying the value was blocked.
      console.warn(
        `${ERROR_PREFIX} Route "${routeName}": defaultSearch does not pass searchSchema — it is trusted config and will still reach state and the URL at runtime (the plugin validates user input, not config). Fix the route's defaultSearch to satisfy its searchSchema.`,
        validation.issues,
      );
    }
  }
}
