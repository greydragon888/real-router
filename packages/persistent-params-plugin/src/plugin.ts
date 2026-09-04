// packages/persistent-params-plugin/src/plugin.ts

import { UNKNOWN_ROUTE } from "@real-router/core";
import { putField } from "@real-router/core/utils";

import { ERROR_PREFIX } from "./constants";
import { extractOwnParams, mergeParams } from "./param-utils";
import { validateParamValue } from "./validation";

import type { Params, SearchParams, State, Plugin } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

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

export class PersistentParamsPlugin {
  readonly #api: PluginApi;
  readonly #paramNamesSet: Set<string>;
  readonly #originalRootPath: string;
  readonly #removeForwardStateInterceptor: () => void;
  readonly #claim: {
    write: (state: State, value: Readonly<Params>) => void;
    release: () => void;
  };

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
    this.#claim = api.claimContextNamespace("persistentParams");

    let removeForwardState: (() => void) | undefined;

    try {
      api.setRootPath(`${originalRootPath}?${[...paramNamesSet].join("&")}`);

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
      removeForwardState?.();
      api.setRootPath(originalRootPath);

      throw new Error(
        `${ERROR_PREFIX} Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } /* v8 ignore stop */

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
  // params into the target state's QUERY channel (#1563). A removal request
  // (`{ key: undefined }`) is honoured for THIS transition by `mergeParams`,
  // which treats `undefined` as a delete. It is NOT applied to the tracked
  // set/snapshot here: this runs before the deactivation/activation guards, so a
  // rejected or cancelled transition must leave the param intact (#803). The
  // permanent removal is committed in #onTransitionSuccess against the state that
  // actually committed.
  #forwardStateSearch(search: SearchParams, params: Params): SearchParams {
    const safeSearch = extractOwnParams(search as unknown as Params);
    const safeParams = extractOwnParams(params);

    // The path bag keeps its historical treatment — EVERY key is validated, the
    // plugin having always policed the whole single-bag argument. The removal
    // marker needs no exemption: `undefined` is an ACCEPTED value here, being
    // the request itself.
    for (const [key, value] of objectEntries(safeParams)) {
      validateParamValue(key, value);
    }

    const merged = mergeParams(this.#persistentParams, safeSearch);

    // The query bag is core's own channel and legitimately carries values this
    // plugin does not accept for its keys (`?a=1&a=2` parses to an array), so
    // only the plugin's OWN keys are policed here.
    //
    // ⚑ `hasOwn` is load-bearing, not a fast path: `safeSearch[key]` on an
    // ABSENT key reads through to `Object.prototype`, and four trackable names
    // find a function there (`toString`, `valueOf`, `constructor`,
    // `hasOwnProperty` — `validation.ts` measures which names work). Without the
    // gate, tracking one of them would refuse every navigation that does not
    // carry it.
    for (const key of this.#paramNamesSet) {
      if (hasOwn(safeSearch, key)) {
        validateParamValue(key, safeSearch[key]);
      } else if (hasOwn(safeParams, key) && safeParams[key] === undefined) {
        // A removal spelled in the PATH bag. Core does not read an
        // undefined-valued key as a channel error — it refuses a declared query
        // name there only when it carries a VALUE — so the request is honoured
        // as the request it is, and the injected twin stands down for this
        // transition. `mergeParams` has already applied the same marker when it
        // arrives in the query bag.
        delete merged[key];
      }
    }

    return merged as unknown as SearchParams;
  }

  #onTransitionSuccess(toState: State): void {
    // A committed UNKNOWN_ROUTE state is not a navigation intent (#1676). Core
    // hand-builds the 404 with BOTH channels empty — the path matched no route,
    // so there is no route to declare where its keys belong — while keeping the
    // `path` that still carries the query. Absence there says nothing about what
    // the caller wanted, unlike the `navigate(…, { key: undefined })` the removal
    // branch below is written for, so the snapshot passes through untouched.
    //
    // Reading it as a removal retired the key for the router's remaining life on
    // every channel that commits a 404: `start()` on an unmatched path, a
    // popstate onto a dead link, and `replace()` dropping the active route — the
    // last of which broke the persistent-params e2e of all six combined examples
    // (#1674). The snapshot is still published, so a 404 page reads the same
    // `state.context.persistentParams` as any other route.
    if (toState.name === UNKNOWN_ROUTE) {
      this.#claim.write(toState, this.#persistentParams);

      return;
    }

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
      const inSearch = hasOwn(toState.search, key);
      const present = inSearch || hasOwn(toState.params, key);
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
          hasOwn(this.#persistentParams, key) &&
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
        // ⚠ `putField` here is INERT today, measured rather than assumed, and it
        // stays for consistency with the plugin's three other sites rather than
        // because it currently buys anything. `newParams` is `{ ...snapshot }`,
        // so it already OWNS every tracked key — `[[Set]]` stops at the own
        // property and never reaches the chain, which is exactly the branch
        // `putField` takes for an own key. Instrumented: the line is reached
        // twice across a two-navigation run and the outcome is byte-identical
        // with a plain store, under all three hazard shapes.
        //
        // It becomes live only if a tracked key can be absent from the snapshot
        // while present in `#paramNamesSet`. Do not delete it on the strength of
        // "the snapshot always has it" — that is the assumption, not the
        // guarantee.
        putField(newParams, key, value);
      }
    }

    if (newParams) {
      this.#persistentParams = freeze(newParams);
    }

    this.#claim.write(toState, this.#persistentParams);
  }

  #teardown(): void {
    this.#removeForwardStateInterceptor();
    this.#claim.release();

    /* v8 ignore start -- @preserve: setRootPath throws RouterError(ROUTER_DISPOSED) during router.dispose() */
    try {
      // ⚠ The return value is IGNORED, and that is a known residual rather than
      // an oversight. Core gives `setRootPath` a `boolean` precisely because a
      // refusal here is a `logger.error` and a `false`, not a throw — so the
      // `catch` below cannot see it, and a `teardown()` cannot wait for the
      // navigation the way the message asks: the plugin will never be called
      // again. It does not bite TODAY because core scopes the refusal to the
      // root's PATH half and these keys are a query-only declaration, so this
      // restore always lands. It would bite a plugin stacked on top of a path
      // prefix, where `originalRootPath` carries one — and acting on the `false`
      // means re-applying on the next settle, i.e. keeping a listener alive past
      // teardown. That is a behaviour decision, not a cleanup (#1755).
      this.#api.setRootPath(this.#originalRootPath);
    } catch {
      // Expected during router.dispose(): FSM enters DISPOSED before plugin teardown,
      // so setRootPath's throwIfDisposed() check throws. Restoring rootPath on a
      // destroyed router is unnecessary — swallow silently.
    }
    /* v8 ignore stop */
  }
}
