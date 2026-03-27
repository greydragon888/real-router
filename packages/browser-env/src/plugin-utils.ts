import { updateBrowserState } from "./popstate-utils";

import type { Browser } from "./types";
import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export function createStartInterceptor(
  api: PluginApi,
  browser: Browser,
): () => void {
  return api.addInterceptor("start", (next, path) =>
    next(path ?? browser.getLocation()),
  );
}

export function createReplaceHistoryState(
  api: PluginApi,
  router: Router,
  browser: Browser,
  buildUrl: (name: string, params?: Params) => string,
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
      1, // forceId
    );

    updateBrowserState(builtState, buildUrl(name, params), true, browser);
  };
}

export function shouldReplaceHistory(
  navOptions: NavigationOptions,
  toState: State,
  fromState: State | undefined,
): boolean {
  return (
    (navOptions.replace ?? !fromState) ||
    (!!navOptions.reload && toState.path === fromState.path)
  );
}
