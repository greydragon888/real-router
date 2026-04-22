import type { NavigationBrowser } from "./types";
import type { Params, Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Makes `router.start()` path optional by injecting browser location.
 * Identical to browser-env's createStartInterceptor, adapted for NavigationBrowser.
 */
export function createStartInterceptor(
  api: PluginApi,
  browser: NavigationBrowser,
): () => void {
  return api.addInterceptor("start", (next, path) =>
    next(path ?? browser.getLocation()),
  );
}

/**
 * Creates replaceHistoryState extension for NavigationBrowser.
 *
 * IMPORTANT: Must set isSyncingFromRouter=true before calling browser.replaceState
 * because navigation.navigate({history:"replace"}) fires a navigate event.
 * Without this flag, the navigate handler would trigger a full navigation.
 */
export function createReplaceHistoryState(
  api: PluginApi,
  router: Router,
  browser: NavigationBrowser,
  buildUrl: (name: string, params?: Params) => string,
  setSyncing: (value: boolean) => void,
): (name: string, params?: Params) => void {
  return (name: string, params: Params = {}) => {
    const state = api.buildState(name, params);

    if (!state) {
      throw new Error(
        `[real-router] Cannot replace state: route "${name}" is not found`,
      );
    }

    const builtState = api.makeState(
      state.name,
      state.params,
      router.buildPath(state.name, state.params),
      {
        params: state.meta,
      },
    );

    const url = buildUrl(name, params) + browser.getHash();
    const historyState = {
      name: builtState.name,
      params: builtState.params,
      path: builtState.path,
    };

    setSyncing(true);

    try {
      browser.replaceState(historyState, url);
    } finally {
      setSyncing(false);
    }
  };
}
