import { isStateStrict as isState } from "type-guards";

import type { BrowserPluginOptions, Browser } from "./types";
import type { PluginApi, State, Params } from "@real-router/core";

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
 * @param options - Browser plugin options
 * @returns Route identifier or undefined
 */
export function getRouteFromEvent(
  evt: PopStateEvent,
  api: PluginApi,
  browser: Browser,
  options: BrowserPluginOptions,
): { name: string; params: Params } | undefined {
  if (isState(evt.state)) {
    return { name: evt.state.name, params: evt.state.params };
  }

  const state = api.matchPath(browser.getLocation(options));

  return state ? { name: state.name, params: state.params } : undefined;
}

/**
 * Updates browser state (pushState or replaceState)
 *
 * @param state - Router state
 * @param url - URL to set
 * @param replace - Whether to replace instead of push
 * @param browser - Browser API instance
 * @param options - Browser plugin options
 */
export function updateBrowserState(
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
  options: BrowserPluginOptions,
): void {
  const trimmedState: Record<string, unknown> & {
    name: string;
    params: Params;
    path: string;
  } = {
    meta: state.meta,
    name: state.name,
    params: state.params,
    path: state.path,
  };

  const currentBrowserState = options.mergeState
    ? browser.getState()
    : undefined;

  const finalState = currentBrowserState
    ? { ...currentBrowserState, ...trimmedState }
    : trimmedState;

  if (replace) {
    browser.replaceState(finalState, "", url);
  } else {
    browser.pushState(finalState, "", url);
  }
}
