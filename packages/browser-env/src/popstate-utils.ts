import { isStateStrict as isState } from "type-guards";

import type { Browser } from "./types";
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
