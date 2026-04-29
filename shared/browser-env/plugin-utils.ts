import { encodeHashFragment, normalizeHashInput } from "./url-context.js";

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

export function createReplaceHistoryState(
  api: PluginApi,
  router: Router,
  browser: ReplaceStateBrowser,
  buildUrl: (
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

    // Pass hash through buildUrl when the plugin understands it (avoids
    // double-append). Hash-plugin's buildUrl ignores the option and warns,
    // so call without options here for semantic clarity — but the result is
    // identical because hashSegment is "" in that branch (preserveHash=false).
    const url = buildUrl(name, params) + hashSegment;

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
