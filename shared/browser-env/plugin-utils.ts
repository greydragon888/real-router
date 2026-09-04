import { encodeHashFragment, normalizeHashInput } from "./url-context.js";
import { buildUrl } from "./url-utils.js";

import type {
  NavigationOptions,
  Params,
  Router,
  SearchParams,
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
): (
  route: string,
  params?: Params,
  search?: SearchParams,
  opts?: { hash?: string },
) => string {
  return (route, params, search, opts) => {
    // Search-aware buildUrl (RFC-4 M2 / #1548): the explicit query channel
    // threads through to `buildPath`, so a colliding name resolves and the URL
    // query comes from `search` when supplied. Omitted → the v1 single-bag path.
    const path = router.buildPath(route, params, search);
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
  browser: ReplaceStateBrowser,
  /**
   * Path to URL — the plugin's own prefixing, and NOTHING that re-derives the
   * path. It is handed `state.path`, which the resolution above already
   * canonicalised (#2087).
   */
  pathToUrl: (path: string) => string,
  preserveHash = true,
): (
  name: string,
  params?: Params,
  search?: SearchParams,
  options?: ReplaceHistoryStateOptions,
) => void {
  // Reusable buffer — browsers structured-clone state synchronously inside
  // replaceState, so the buffer never escapes. Eliminates one allocation per
  // navigation on the hot path. (Mirrors createUpdateBrowserState.)
  const buffer = {
    name: "",
    params: {} as Params,
    search: {} as SearchParams,
    path: "",
  };

  return (
    name: string,
    params: Params = {},
    search?: SearchParams,
    options?: ReplaceHistoryStateOptions,
  ) => {
    // buildNavigationState resolves forwardTo and existence in one call
    // (undefined = unknown route) and canonicalizes BOTH channels — so the
    // caller's `search` goes IN (#1571's third slot) and the resolved channels
    // come back out. Passing it is not a formality: the seam is where a
    // `forwardState` interceptor (`search-schema`, `persistent-params`) reads the
    // query channel, and where the forwarding chain's own `defaultParams` are
    // layered into whichever channel the TARGET declares (#1570) — the query
    // half of that split exists only in `state.search`, never in the caller's
    // bag, so rebuilding the record from the raw `search` silently dropped it
    // (#1574).
    const state = api.buildNavigationState(name, params, search);

    if (!state) {
      throw new Error(
        `[real-router] Cannot replace state: route "${name}" is not found`,
      );
    }

    // `state` IS the record (#1585). `buildNavigationState` already returns a
    // state carrying the path that same canonicalization produced, so re-making
    // it through `makeState` with a freshly built path is byte-identical — same
    // name, same channels, same string — and therefore redundant work. It buys
    // no seam pass either: `makeState` reaches none, on either arm
    // (`seam-coverage-authority-1938` owns the two rows).
    //
    // The channel guarantee holds regardless, because it is a property of
    // `state` itself rather than of any re-make: `state.search` is the caller's
    // `search` after the seam layered the forwarding chain's query-channel
    // defaults under it, so the record cannot carry a half-resolved query
    // (#1574). Omitted by the caller and contributed by no hop → the frozen
    // empty search bag. ⚠ An explicit value still outranks a hop default because
    // of #1570's rule — a default is never applied to a slot the caller already
    // filled, in EITHER bag — and that rule lives in the merge, so it held when
    // stage ② was deleted.
    //
    // The extra fields `buildNavigationState` returns (`context`, `transition`)
    // never reach the browser: only the four channels below are copied into the
    // buffer that `replaceState` structured-clones.

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

    // The fragment is appended separately as `+ hashSegment`. For
    // browser/navigation-plugin it carries the explicit or preserved fragment;
    // for hash-plugin it is always "" (preserveHash=false), and the plugin
    // strips { hash } before this runs (#1230), so no stray fragment is spliced
    // into a hash-route URL.
    //
    // ⚑ The RESOLVED path, prefixed — never a second derivation from the
    // channels (#1585, #2087). A rebuild asks the `forwardState` seam again with
    // channels this call has already resolved, so an injector that is not
    // idempotent contributes twice and the URL contradicts the record beside it.
    // Taking `state.path` makes the two one string by construction, which is
    // what `navigate` has always done. Pinned by "agrees even when the
    // interceptor is NOT idempotent" in `replace-history-state-agreement`.
    const url = pathToUrl(state.path) + hashSegment;

    buffer.name = state.name;
    buffer.params = state.params;
    buffer.search = state.search;
    buffer.path = state.path;

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
