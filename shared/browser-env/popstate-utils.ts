import { isStateStrict as isState } from "type-guards";

import type { Browser } from "./types.js";
import type { State, Params } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Extracts route name and params from a popstate event.
 *
 * - If history.state is a valid router state → returns name/params from it
 * - If not (e.g. manually entered URL) → matches current URL against route tree
 * - Returns undefined if no route matches
 *
 * @param evt - PopStateEvent from browser
 * @param api - PluginApi instance
 * @param browser - Browser API instance
 * @returns Route identifier or undefined
 */
export function getRouteFromEvent(
  evt: PopStateEvent,
  api: PluginApi,
  browser: Browser,
): { name: string; params: Params } | undefined {
  if (isState(evt.state)) {
    return { name: evt.state.name, params: evt.state.params };
  }

  const state = api.matchPath(browser.getLocation());

  return state ? { name: state.name, params: state.params } : undefined;
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
