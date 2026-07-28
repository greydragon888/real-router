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
  router: Router,
  browser: ReplaceStateBrowser,
  buildUrlFn: (
    name: string,
    params?: Params,
    search?: SearchParams,
    options?: ReplaceHistoryStateOptions,
  ) => string,
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

    const builtState = api.makeState(
      state.name,
      state.params,
      // Explicit query channel (RFC-4 M2 / #1548), taken from the RESOLVED
      // state rather than the caller's bag: `state.search` is the caller's
      // `search` after the seam layered the chain's query-channel defaults
      // under it. Both channels of the record therefore come from the same
      // canonicalization that produced `state.name`/`state.params`, so the
      // `history.state` record agrees with the URL instead of carrying a
      // half-resolved query (#1574). Omitted by the caller and contributed by
      // no hop → the frozen empty search bag, as before.
      //
      // ⚠ Why an explicit value still outranks a hop default is #1570's rule —
      // a default is never applied to a slot the caller already filled, in
      // EITHER bag — NOT the spread order inside `separateChannels`. The two
      // are easy to confuse because today they agree: the seam does spread the
      // caller's bag last. But that is stage ②, which the nav-pipeline work
      // removes in Phase 4, whereas the withholding rule is a property of the
      // merge and survives it. Anchoring the guarantee on the spread order would
      // make this comment silently false the day the seam's wrapper goes.
      state.search,
      router.buildPath(state.name, state.params, state.search),
      // No meta arg: since #1548 the per-segment param-source map is read from
      // the live matcher by `state.name` (getMetaForState), not carried onto the
      // built State — the removed `stateMetaStore` sidecar.
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
    // (#1230), so no stray fragment is spliced into a hash-route URL. The
    // caller's `search` (RFC-4 M2 / #1548) threads through so the query lands in
    // the rebuilt URL, matching the built State above.
    const url = buildUrlFn(name, params, search) + hashSegment;

    buffer.name = builtState.name;
    buffer.params = builtState.params;
    buffer.search = builtState.search;
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
