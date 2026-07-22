import { encodeHashFragment, normalizeHashInput } from "./url-context.js";
import { buildUrl } from "./url-utils.js";

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

/**
 * Hash override option for `replaceHistoryState` (#532). Tri-state semantics:
 *   `undefined`  — preserve the current browser hash (legacy behavior, default)
 *   `""`         — explicitly clear the fragment
 *   non-empty    — explicitly set the fragment (decoded form, no leading "#")
 */
export interface ReplaceHistoryStateOptions {
  hash?: string;
}

export function createStartInterceptor(
  api: PluginApi,
  browser: LocationSource,
): () => void {
  return api.addInterceptor("start", (next, path) =>
    next(path ?? browser.getLocation()),
  );
}

// Shared `buildUrl` extension for browser-plugin and navigation-plugin.
// Composes router.buildPath + base prefixing + tri-state hash (#532) into the
// single function the plugins register via `api.extendRouter({ buildUrl })`.
export function createPluginBuildUrl(
  router: Router,
  base: string,
): (route: string, params?: Params, opts?: { hash?: string }) => string {
  return (route, params, opts) => {
    const path = router.buildPath(route, params);
    const url = buildUrl(path, base);

    if (opts?.hash === undefined) {
      return url;
    }

    const norm = normalizeHashInput(opts.hash);

    return norm ? `${url}#${encodeHashFragment(norm)}` : url;
  };
}

export function createReplaceHistoryState(
  api: PluginApi,
  router: Router,
  browser: ReplaceStateBrowser,
  buildUrlFn: (
    name: string,
    params?: Params,
    options?: ReplaceHistoryStateOptions,
  ) => string,
  preserveHash = true,
): (
  name: string,
  params?: Params,
  options?: ReplaceHistoryStateOptions,
) => void {
  // Reusable buffer — browsers structured-clone state synchronously inside
  // replaceState, so the buffer never escapes. Eliminates one allocation per
  // navigation on the hot path. (Mirrors createUpdateBrowserState.)
  const buffer = {
    name: "",
    params: {} as Params,
    path: "",
  };

  return (
    name: string,
    params: Params = {},
    options?: ReplaceHistoryStateOptions,
  ) => {
    const state = api.buildState(name, params);

    if (!state) {
      throw new Error(
        `[real-router] Cannot replace state: route "${name}" is not found`,
      );
    }

    const builtState = api.makeState(
      state.name,
      state.params,
      // `buildState` yields no separate query channel yet (the search-aware
      // write path is a slot-shift follow-up, RFC-4 M2 / #1548) — pass none.
      undefined,
      router.buildPath(state.name, state.params),
      {
        params: state.meta,
      },
    );

    // Tri-state hash semantics (#532):
    //   options.hash === undefined → preserve (legacy behavior, controlled by
    //                                preserveHash flag — true for browser/
    //                                navigation plugins, false for hash-plugin)
    //   options.hash === ""        → explicitly clear
    //   options.hash === "value"   → explicitly set
    let hashSegment: string;

    if (options?.hash !== undefined) {
      const norm = normalizeHashInput(options.hash);

      hashSegment = norm ? `#${encodeHashFragment(norm)}` : "";
    } else if (preserveHash) {
      hashSegment = browser.getHash();
    } else {
      hashSegment = "";
    }

    // The fragment is appended separately as `+ hashSegment`; buildUrlFn is
    // always called without options. For browser/navigation-plugin hashSegment
    // carries the explicit or preserved fragment; for hash-plugin it is always
    // "" (preserveHash=false), and the plugin strips { hash } before this runs
    // (#1230), so no stray fragment is spliced into a hash-route URL.
    const url = buildUrlFn(name, params) + hashSegment;

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
