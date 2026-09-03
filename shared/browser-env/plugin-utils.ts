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

    // `state` IS the record (#1585). `buildNavigationState` already returns a
    // state carrying the path that same canonicalization produced, so re-making
    // it through `makeState` with a freshly built path is byte-identical — same
    // name, same channels, same string — at the cost of a whole extra trip
    // through the `buildPath` interceptor chain, one more `persistent-params`
    // pass per history record.
    //
    // ⚠ Since #2087 that door runs the `forwardState` seam too, so one history
    // record asks the seam TWICE — once here and once for the URL below, the
    // second time with the channels this call already resolved. The documented
    // injector idiom merges with the incoming bag winning, which makes the
    // second pass a no-op; an interceptor that APPENDS instead would see its
    // contribution twice.
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

    // The fragment is appended separately as `+ hashSegment`; buildUrlFn is
    // always called without options. For browser/navigation-plugin hashSegment
    // carries the explicit or preserved fragment; for hash-plugin it is always
    // "" (preserveHash=false), and the plugin strips { hash } before this runs
    // (#1230), so no stray fragment is spliced into a hash-route URL.
    //
    // Built from the RESOLVED state, not the caller's arguments (#1585). This
    // line is the other arm of #1574: that fix stopped the RECORD from carrying
    // a half-resolved query, and its comment here claimed the URL already
    // matched — it did not. `buildUrlFn` reaches the public `buildPath`, which
    // resolves no `forwardTo`, so the URL was missing exactly what the
    // forwarding chain contributes. Measured: with a
    // `persistent-params`-style injection the record said
    // `/posts/9?tab=new&sort=date&lang=de` while the URL beside it said
    // `/posts/9?tab=new&sort=date`, and for a forwarding route the record said
    // `posts` while the URL said `/old`. `navigate` has always kept the two
    // equal; this brings `replaceHistoryState` into line with it.
    const url =
      buildUrlFn(state.name, state.params, state.search) + hashSegment;

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
