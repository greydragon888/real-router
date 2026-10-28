import { putField } from "@real-router/core/utils";

import { ERROR_PREFIX } from "./constants";
import {
  collectPathParams,
  getInvalidKeys,
  namesOneOf,
  omitKeys,
  pickKeys,
  readAsText,
} from "./helpers";
import { describeRejection } from "./report";

import type { TextPlaces } from "./helpers";
import type { TextRun } from "./report";
import type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
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

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;

/**
 * The schema's verdict on a query: its output, or its issues on the query the
 * text runs settled on — each key the text fixed as text, every other as
 * decoded — with the last text run's query and its issues about each key the
 * text did not fix.
 */
type Verdict =
  | { readonly input: Params; readonly value: unknown }
  | {
      readonly input: Params;
      readonly issues: readonly StandardSchemaV1Issue[];
      readonly text: TextRun;
    };

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

    // Dev-time defaultSearch validation for runtime tree mutations: TREE_CHANGED
    // covers `add`, `update` (a changed `defaultSearch`) and `replace` (a new
    // route set). Production mode skips the subscription entirely.
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

    const verdict = this.#validate(schema, result.name, channel);

    if ("value" in verdict) {
      return this.#writeBack(
        result,
        pathParams,
        this.#schemaOutput(verdict.input, verdict.value),
      );
    }

    if (this.#onError) {
      return this.#writeBack(
        result,
        pathParams,
        this.#onError(result.name, verdict.input, verdict.issues),
      );
    }

    if (this.#mode === "development") {
      console.error(
        describeRejection(
          result.name,
          verdict.input,
          verdict.issues,
          verdict.text,
        ),
        verdict.issues,
      );
    }

    return this.#writeBack(
      result,
      pathParams,
      this.#repair(schema, result.name, verdict.input, verdict.issues),
    );
  }

  /**
   * Runs the schema, and again while it rejects a number or a boolean: on a
   * copy where each one it rejected is its text, `String(value)`. Under
   * `numberFormat` / `booleanFormat: "auto"` the router decodes `?q=17` to 17,
   * and the text is what the URL holds (#2725). A schema that judges in stages
   * — a discriminated union, a refinement that runs once the object parses —
   * names a number only once the value before it is text, so each round tries
   * what the latest run rejected. A key whose text passes keeps it, and a key
   * the last text run still rejects goes back as decoded. The issues are the
   * schema's on that query, not on the text: a check a type issue stops, as a
   * zod refinement is, can reject the decoded query and never run on its text.
   */
  #validate(
    schema: StandardSchemaV1,
    routeName: string,
    channel: Params,
  ): Verdict {
    const first = this.#runSchema(schema, routeName, channel);

    if ("value" in first) {
      return { input: channel, value: first.value };
    }

    let input = channel;
    let { issues } = first;
    const done: TextPlaces = new Map();

    // Each round tries only values the decoded query holds, and none an earlier
    // round tried, so the rounds end.
    for (
      let text = readAsText(channel, input, issues, done);
      text !== undefined;
      text = readAsText(channel, input, issues, done)
    ) {
      input = text;

      const run = this.#runSchema(schema, routeName, input);

      if ("value" in run) {
        return { input, value: run.value };
      }

      issues = run.issues;
    }

    const rejected = getInvalidKeys(issues);
    const unfixed = new Set(
      [...done.keys()].filter((key) => rejected.has(key)),
    );
    const text: TextRun = {
      input,
      issues: issues.filter((issue) => namesOneOf(issue, unfixed)),
    };

    // The query settled on is the last run's when no key goes back as decoded,
    // and the first run's when every key tried does; otherwise it gets a run.
    if (unfixed.size === 0) {
      return { input, issues, text };
    }

    if (unfixed.size === done.size) {
      return { input: channel, issues: first.issues, text };
    }

    // A key never tried holds in `input` what it holds in `channel`, unless the
    // schema writes into its input: `readAsText` copies the query and rewrites
    // only the values it tries.
    const settled = { ...input, ...pickKeys(channel, unfixed) };
    const run = this.#runSchema(schema, routeName, settled);

    return "value" in run
      ? { input: settled, value: run.value }
      : { input: settled, issues: run.issues, text };
  }

  /**
   * Recovery after issues: a rejected key takes its `defaultSearch` value, or is
   * dropped, and the schema runs once more on that repaired query — so the keys
   * come back as the schema outputs them for it (#2824). A repaired query the
   * schema still rejects is written back as the repair built it: a failed run
   * has no output to write.
   */
  #repair(
    schema: StandardSchemaV1,
    routeName: string,
    channel: Params,
    issues: readonly StandardSchemaV1Issue[],
  ): Params {
    const invalidKeys = getInvalidKeys(issues);
    const stripped = omitKeys(channel, invalidKeys);
    const route = this.#routesApi.get(routeName);
    // Recovery fills from the route's query-channel defaults, and `defaultSearch`
    // is the ONLY place those live. Mining `defaultParams` minus the path slots
    // is NOT a second source: core separates no channels — a `defaultParams`
    // naming a declared query key is refused at registration — so whatever
    // survives that subtraction is undeclared path-channel data, and pouring it
    // into the query channel would be this plugin re-creating a repair core
    // does not perform.
    const defaults = (route?.defaultSearch ?? {}) as Params;
    const repaired = { ...pickKeys(defaults, invalidKeys), ...stripped };
    const revalidation = this.#runSchema(schema, routeName, repaired);

    return {
      ...defaults,
      ...("value" in revalidation
        ? this.#schemaOutput(repaired, revalidation.value)
        : stripped),
    };
  }

  /**
   * The schema's output for `input`: under `strict` exactly that, otherwise
   * merged over `input`, so a key the schema does not declare passes through.
   */
  #schemaOutput(input: Params, value: unknown): Params {
    return this.#strict
      ? (value as Params)
      : { ...input, ...(value as Params) };
  }

  /** `forwardState` is synchronous, so a schema that answers with a Promise is refused. */
  #runSchema(
    schema: StandardSchemaV1,
    routeName: string,
    input: Params,
  ): StandardSchemaV1Result {
    const validation = schema["~standard"].validate(input);

    if (validation instanceof Promise) {
      throw new TypeError(
        `${ERROR_PREFIX} Async schema validation is not supported. Route "${routeName}" returned a Promise from ~standard.validate().`,
      );
    }

    return validation;
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

    for (const [key, value] of objectEntries(result.params)) {
      if (pathParams.has(key)) {
        // ⚑ A path slot's name, from the route (#1852). Measured: an ambient
        // accessor there rejected the navigation outright, or — with a setter —
        // lost the slot and left core reporting `Missing required param 'id'`
        // about a value the caller had supplied.
        putField(params, key, value);
      } else if (hasOwn(validated, key)) {
        putField(params, key, validated[key]);
      }
    }

    const search: Params = {};
    // A single-bag `buildPath(name, params)` hands the seam no `search`.
    const fromSearch = (result.search as SearchParams | undefined) ?? {};

    for (const [key, value] of objectEntries(validated)) {
      const wentToParams = hasOwn(result.params, key) && !pathParams.has(key);

      if (!wentToParams || hasOwn(fromSearch, key)) {
        // The schema's OUTPUT (#1852) — under a setter the schema ran, reported
        // success, and its result reached neither `state.search` nor the URL.
        putField(search, key, value);
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
