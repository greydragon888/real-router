import { isStateStrict as isState } from "type-guards";

import type { Browser } from "./types.js";
import type { State, Params } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Resolves the popstate event into a navigation-ready `State`.
 *
 * - If `history.state` is a valid router state ({name, params, path} written
 *   by browser-plugin/hash-plugin during their previous navigation), it is
 *   the source of truth — synthesize a fully-typed `State` from it via
 *   `api.makeState`. The synthesized `transition`/`context` fields are
 *   placeholders; the navigation pipeline (`completeTransition` and plugin
 *   claim writes) replaces them.
 *   This branch is mandatory for hash-plugin: `browser.getLocation()`
 *   returns the History pathname, not the hash, so the matchPath fallback
 *   below cannot extract the hash route.
 * - Otherwise (e.g. manually entered URL with no recorded state), fall
 *   back to `api.matchPath(browser.getLocation())`. browser-plugin's
 *   `getLocation` returns the URL pathname — this works.
 * - `undefined` when neither path produces a match.
 *
 * Replaces the previous `{ name, params }` shape so the caller can hand
 * the State directly to `router.navigateToState(state, opts)` and skip
 * the redundant `forwardState`/`buildPath` round-trip in
 * `buildNavigateState` (issue #525).
 */
export function getRouteFromEvent(
  evt: PopStateEvent,
  api: PluginApi,
  browser: Browser,
): State | undefined {
  if (isState(evt.state)) {
    return api.makeState(evt.state.name, evt.state.params, evt.state.path);
  }

  return api.matchPath(browser.getLocation());
}

/**
 * Updates browser state (pushState or replaceState)
 *
 * @param state - Router state
 * @param url - URL to set
 * @param replace - Whether to replace instead of push
 * @param browser - Browser API instance
 */
export function updateBrowserState(
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
): void {
  const historyState = {
    name: state.name,
    params: state.params,
    path: state.path,
  };

  if (replace) {
    browser.replaceState(historyState, url);
  } else {
    browser.pushState(historyState, url);
  }
}

/**
 * Creates a `updateBrowserState` closure that reuses a single mutable buffer
 * across calls instead of allocating a fresh `{ name, params, path }` object
 * per push/replace.
 *
 * Why: Browsers structured-clone `history.state` synchronously inside
 * `pushState`/`replaceState`, so the caller never sees the buffer escape —
 * it can be safely overwritten before the next call. Eliminates one
 * allocation per navigation on the hot path.
 *
 * Each plugin instance must own its own buffer (do not share across plugins).
 */
export function createUpdateBrowserState(): (
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
) => void {
  const buffer = {
    name: "",
    params: {} as Params,
    path: "",
  };

  return (state, url, replace, browser) => {
    buffer.name = state.name;
    buffer.params = state.params;
    buffer.path = state.path;

    if (replace) {
      browser.replaceState(buffer, url);
    } else {
      browser.pushState(buffer, url);
    }
  };
}
