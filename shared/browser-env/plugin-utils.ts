import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export interface LocationSource {
  getLocation: () => string;
}

/**
 * Minimal browser surface needed by `createReplaceHistoryState`.
 *
 * Both `Browser` (History API) and navigation-plugin's `NavigationBrowser`
 * (Navigation API) satisfy this structurally — the function never needs
 * `pushState`/`addPopstateListener`, only the replace path.
 */
export interface ReplaceStateBrowser {
  replaceState: (state: unknown, url: string) => void;
  getHash: () => string;
}

export function createStartInterceptor(
  api: PluginApi,
  browser: LocationSource,
): () => void {
  return api.addInterceptor("start", (next, path) =>
    next(path ?? browser.getLocation()),
  );
}

export function createReplaceHistoryState(
  api: PluginApi,
  router: Router,
  browser: ReplaceStateBrowser,
  buildUrl: (name: string, params?: Params) => string,
  preserveHash = true,
): (name: string, params?: Params) => void {
  // Reusable buffer — browsers structured-clone state synchronously inside
  // replaceState, so the buffer never escapes. Eliminates one allocation per
  // navigation on the hot path. (Mirrors createUpdateBrowserState.)
  const buffer = {
    name: "",
    params: {} as Params,
    path: "",
  };

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

    const hash = preserveHash ? browser.getHash() : "";
    const url = buildUrl(name, params) + hash;

    buffer.name = builtState.name;
    buffer.params = builtState.params;
    buffer.path = builtState.path;

    browser.replaceState(buffer, url);
  };
}

export function shouldReplaceHistory(
  navOptions: NavigationOptions,
  toState: State,
  fromState: State | undefined,
): boolean {
  if (navOptions.replace === true) {
    return true;
  }

  if (!fromState) {
    return navOptions.replace !== false;
  }

  return !!navOptions.reload && toState.path === fromState.path;
}
