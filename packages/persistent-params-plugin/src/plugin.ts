// packages/persistent-params-plugin/src/plugin.ts

import { ERROR_PREFIX } from "./constants";
import { extractOwnParams, mergeParams } from "./param-utils";
import { validateParamValue } from "./validation";

import type { Params, SearchParams, State, Plugin } from "@real-router/core";
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
        (next, route, navParams, navSearch) =>
          // Persistent params are QUERY params (declared on the root path as
          // `?a&b`), so they are injected into the SEARCH channel — the channel
          // the built URL takes its query from (RFC-4 M2 / #1548, #1563) — and
          // the path bag is handed on untouched. A v1 single-bag caller passes
          // no `search`, and the matcher then reads the query out of `params`
          // (`search ?? params`), so that bag is the query source here: routing
          // it back through `search` keeps the caller's query keys on the URL
          // without the plugin ever writing into the path channel.
          // Persistent (query) params and the search channel are the same
          // query-bag shape at runtime; the `Params`/`SearchParams` type split is
          // structural only, so cast across the seam.
          next(
            route,
            navParams,
            this.#buildPathSearch(
              (navSearch as unknown as Params | undefined) ?? navParams ?? {},
            ) as unknown as SearchParams,
          ),
      );

      removeForwardState = api.addInterceptor(
        "forwardState",
        (next, routeName, routeParams, routeSearch) => {
          // Forward both channels through the chain (RFC-4 M2 / #1548) so a
          // downstream search-schema interceptor still sees the matched query on
          // the URL→State path, then inject the persistent params into the QUERY
          // channel of the result — the channel this plugin itself declared them
          // in (`setRootPath("?a&b")` above), never the path bag (#1563).
          const result = next(routeName, routeParams, routeSearch);

          return {
            ...result,
            search: this.#forwardStateSearch(result.search, result.params),
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
  // params into the target state's QUERY channel (#1563) and RECORDS — but does
  // not commit — any removal requests (`{ key: undefined }`), which reach the
  // plugin in EITHER channel: `search` is the canonical form, the path bag the
  // legacy single-bag one. The removal is NOT applied to the tracked
  // set/snapshot here: this runs before the deactivation/activation guards, so a
  // rejected or cancelled transition must leave the param intact (#803). The
  // permanent removal is committed in #onTransitionSuccess against the state that
  // actually committed. `mergeParams` honors `undefined` as a delete for the
  // current transition's query.
  #forwardStateSearch(search: SearchParams, params: Params): SearchParams {
    const safeSearch = extractOwnParams(search as unknown as Params);
    const safeParams = extractOwnParams(params);

    // Reset the per-navigation record: forwardState opens the synchronous
    // forwardState → buildPath window that buildPath consumes.
    this.#pendingRemovals.clear();

    // The path bag keeps its historical treatment — EVERY key is validated, the
    // plugin having always policed the whole single-bag argument.
    for (const [key, value] of Object.entries(safeParams)) {
      if (value === undefined && this.#paramNamesSet.has(key)) {
        this.#pendingRemovals.add(key);
      } else {
        validateParamValue(key, value);
      }
    }

    const merged = mergeParams(this.#persistentParams, safeSearch);

    for (const key of this.#paramNamesSet) {
      if (Object.hasOwn(safeSearch, key)) {
        // The query bag is core's own channel and legitimately carries values
        // this plugin does not accept for its keys (`?a=1&a=2` parses to an
        // array), so only the plugin's OWN keys are policed here.
        if (safeSearch[key] === undefined) {
          this.#pendingRemovals.add(key);
        } else {
          validateParamValue(key, safeSearch[key]);
        }
      } else if (Object.hasOwn(safeParams, key)) {
        // A tracked key the caller passed in the PATH bag alone (the legacy
        // single-bag form) keeps the caller's value: core routes it into the
        // query channel at the forwardState boundary, where an injected twin of
        // ours would outrank it (`{ ...fromParamsBag, ...search }` — search
        // wins, #843). An explicit `search` value beats both, hence the order of
        // these branches.
        delete merged[key];
      }
    }

    return merged as unknown as SearchParams;
  }

  // buildPath phase (runs second in buildNavigateState, and standalone for
  // `router.buildPath()`). Injects persistent params into the query the URL is
  // built from, then drops the keys the paired forwardState just removed —
  // otherwise the freshly-removed param would be re-injected into the built path
  // from the still-unchanged snapshot (the `undefined` marker is gone by the time
  // the query source reaches buildPath). Consume-once: a standalone buildPath
  // sees an empty set and injects normally.
  #buildPathSearch(querySource: Params): Params {
    const safeParams = extractOwnParams(querySource);

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
      // Persistent params are QUERY params (declared on the root path as
      // `?a&b`). After the RFC-4 M2 params/search split (#1548) a committed
      // query value lands in `toState.search` on every path the plugin itself
      // produces — it injects into the query channel (#1563) and core's
      // separation keeps it there. The `params` fallback covers a state built
      // OUTSIDE that flow: a hand-made `makeState` bag committed via
      // `navigateToState` can still carry the key in `params` (with `search`
      // left `{}`). Read the value from whichever channel carries the key:
      // `search` is canonical, `params` is the hand-built fallback.
      const inSearch = Object.hasOwn(toState.search, key);
      const present = inSearch || Object.hasOwn(toState.params, key);
      const value = inSearch ? toState.search[key] : toState.params[key];

      if (!present || value === undefined) {
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
