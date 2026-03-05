import { isStateStrict as isState } from "type-guards";

import type { BrowserPluginOptions, HistoryState, Browser } from "./types";
import type {
  PluginApi,
  Router,
  NavigationOptions,
  State,
} from "@real-router/core";

/**
 * Creates state from popstate event
 *
 * @param evt - PopStateEvent from browser
 * @param api - PluginApi instance
 * @param browser - Browser API instance
 * @param options - Browser plugin options
 * @returns Router state or undefined
 */
export function createStateFromEvent(
  evt: PopStateEvent,
  api: PluginApi,
  browser: Browser,
  options: BrowserPluginOptions,
): State | undefined {
  const isNewState = !isState(evt.state);

  if (isNewState) {
    return api.matchPath(browser.getLocation(options));
  }

  return api.makeState(
    evt.state.name,
    evt.state.params,
    evt.state.path,
    {
      ...evt.state.meta,
      params: evt.state.meta?.params ?? {},
    },
    evt.state.meta?.id,
  );
}

/**
 * Checks if transition should be skipped (same states)
 *
 * @param newState - New state from event
 * @param currentState - Current router state
 * @param router - Router instance
 * @returns true if transition should be skipped
 */
export function shouldSkipTransition(
  newState: State,
  currentState: State | undefined,
  router: Router,
): boolean {
  return !!(
    currentState && router.areStatesEqual(newState, currentState, false)
  );
}

/**
 * Handles missing state by navigating to default route
 *
 * @param router - Router instance
 * @param api - Plugin API instance
 * @param transitionOptions - Options for transition
 * @returns true if handled, false if no default route
 */
export function handleMissingState(
  router: Router,
  api: PluginApi,
  transitionOptions: NavigationOptions,
): boolean {
  const routerOptions = api.getOptions();
  const { defaultRoute } = routerOptions;

  if (!defaultRoute) {
    return false;
  }

  void router.navigateToDefault({
    ...transitionOptions,
    reload: true,
    replace: true,
  });

  return true;
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
  const trimmedState: HistoryState = {
    meta: state.meta,
    name: state.name,
    params: state.params,
    path: state.path,
  };

  const currentBrowserState = options.mergeState
    ? browser.getState()
    : undefined;

  const finalState: HistoryState = currentBrowserState
    ? { ...currentBrowserState, ...trimmedState }
    : trimmedState;

  if (replace) {
    browser.replaceState(finalState, "", url);
  } else {
    browser.pushState(finalState, "", url);
  }
}
