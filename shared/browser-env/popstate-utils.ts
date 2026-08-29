import { isStateStrict as isState } from "./state-guard";

import type { Browser } from "./types.js";
import type { State, Params, SearchParams } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Resolves the popstate event into a navigation-ready `State`.
 *
 * - If `history.state` is a valid router state ({name, params, path} written
 *   by browser-plugin/hash-plugin during their previous navigation), it is
 *   the source of truth — synthesize a fully-typed `State` from it via
 *   `api.makeState`. The synthesized `transition`/`context` fields are
 *   placeholders; the navigation pipeline (`completeTransition` and plugin
 *   claim writes) replaces them.
 * - Otherwise (e.g. manually entered URL with no recorded state), fall back
 *   to `api.matchPath(location)`. `location` is the route location the caller
 *   captured when the popstate event fired — each plugin derives it from its
 *   own `browser.getLocation()`, and both return a path the matcher understands
 *   (browser-plugin: the History pathname; hash-plugin: the hash route via
 *   `buildHashLocation(location.hash, ...)`), so the fallback works for both.
 *   (#760)
 * - `undefined` when neither path produces a match.
 *
 * The caller passes the location it snapshotted at event time rather than
 * letting this function re-read `browser.getLocation()`: a deferred popstate
 * is processed only after the in-flight navigation's `replaceState` has
 * already overwritten the live location, so a late read would resolve the
 * wrong target (#757).
 *
 * Replaces the previous `{ name, params }` shape so the caller can hand
 * the State directly to `router.navigateToState(state, opts)` and skip
 * the redundant `forwardState`/`buildPath` round-trip in
 * `buildNavigateState` (issue #525).
 *
 * Accepts `HashChangeEvent` too (#759): a `hashchange` carries no history
 * `state`, so it always resolves via the `matchPath(location)` fallback — the
 * correct source of truth for an external fragment change, where the URL, not
 * a plugin-recorded entry, defines the target.
 */
export function getRouteFromEvent(
  evt: PopStateEvent | HashChangeEvent,
  api: PluginApi,
  location: string,
): State | undefined {
  const raw: unknown = "state" in evt ? evt.state : undefined;

  // ⚑ ONE read per member, and the snapshot is what gets both VALIDATED and
  // COMMITTED (#1837). This read each member twice — once through `isState`,
  // once again building the `makeState` arguments — so on an entry that answers
  // differently between them the guard's verdict described one state and the
  // router committed another. Measured with a drifting payload: the guard
  // approved `users.view` / `/users/view/1` and `home` / `/TOTALLY/OTHER`
  // landed.
  //
  // ⚠ Reachability, stated rather than implied: a real browser runs
  // StructuredSerializeForStorage on `pushState`, so a genuine `history.state`
  // comes back plain and cannot drift. It is reachable from a SYNTHETIC
  // `PopStateEvent` and under jsdom, which stores the entry by identity — the
  // same reachability as the accessor escape the guard's boundary closes, and
  // the reason both are closed together rather than one of them.
  //
  // The snapshot is itself a read, so it sits inside a `try`: a throwing
  // accessor here must take the same `matchPath` fallback an unreadable entry
  // takes, not escape into the handler's critical-error path.
  let snapshot: unknown = raw;

  if (raw !== null && typeof raw === "object") {
    const entry = raw as Record<string, unknown>;

    try {
      snapshot = {
        name: entry.name,
        params: entry.params,
        search: entry.search,
        path: entry.path,
      };
    } catch {
      snapshot = undefined;
    }
  }

  if (isState(snapshot)) {
    // Restore the query channel too (RFC-4 M2 / #1548). Entries written before
    // M2 have no `search` — `makeState` reuses the frozen empty bag for them.
    return api.makeState(
      snapshot.name,
      snapshot.params,
      snapshot.search,
      snapshot.path,
    );
  }

  return api.matchPath(location);
}

/**
 * Updates browser state (pushState or replaceState)
 *
 * @param state - Router state
 * @param url - URL to set
 * @param replace - Whether to replace instead of push
 * @param browser - Browser API instance
 */
export function updateBrowserState(
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
): void {
  const historyState = {
    name: state.name,
    params: state.params,
    // Persist the query channel so a popstate/refresh restores it (RFC-4 M2).
    search: state.search,
    path: state.path,
  };

  if (replace) {
    browser.replaceState(historyState, url);
  } else {
    browser.pushState(historyState, url);
  }
}

/**
 * Creates a `updateBrowserState` closure that reuses a single mutable buffer
 * across calls instead of allocating a fresh `{ name, params, path }` object
 * per push/replace.
 *
 * Why: Browsers structured-clone `history.state` synchronously inside
 * `pushState`/`replaceState`, so the caller never sees the buffer escape —
 * it can be safely overwritten before the next call. Eliminates one
 * allocation per navigation on the hot path.
 *
 * Each plugin instance must own its own buffer (do not share across plugins).
 */
export function createUpdateBrowserState(): (
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
) => void {
  const buffer = {
    name: "",
    params: {} as Params,
    search: {} as SearchParams,
    path: "",
  };

  return (state, url, replace, browser) => {
    buffer.name = state.name;
    buffer.params = state.params;
    buffer.search = state.search;
    buffer.path = state.path;

    if (replace) {
      browser.replaceState(buffer, url);
    } else {
      browser.pushState(buffer, url);
    }
  };
}

/**
 * True when a popstate-success `replaceState` would be a value-level no-op and
 * can be skipped to avoid a redundant `updateForSameDocumentNavigation` Blink
 * event on back/forward (#1353).
 *
 * On a back/forward to an entry the plugin itself recorded, the browser has
 * ALREADY restored the identical `{name, params, path}` into `history.state`
 * and the matching URL before firing popstate — re-writing them costs a full
 * Blink history event for zero value change.
 *
 * Returns `false` (→ keep the write) for every divergence that makes the write
 * load-bearing, so the correctness cases stay covered:
 *   - redirect            → resolved name/params differ from the restored entry
 *   - path normalization  → resolved path differs (e.g. trailing slash)
 *   - corrupted / missing `history.state` → fails `isState`
 *   - custom `Browser` without a state reader → `getState` absent (opt-in)
 *
 * URL equality is not re-checked: the resolved path is compared directly, and
 * the popstate fragment is sampled FROM the live location, so the committed URL
 * already matches by construction. The deferred-popstate replay (#757) is
 * unaffected too — it reads the event's own snapshotted state/location, never
 * the live entry this write would commit.
 */
export function canSkipPopstateHistoryWrite(
  toState: State,
  browser: Browser,
  areStatesEqual: (
    state1: State,
    state2: State,
    ignoreQueryParams: boolean,
  ) => boolean,
): boolean {
  if (!browser.getState) {
    return false;
  }

  const live = browser.getState();

  if (!isState(live) || live.path !== toState.path) {
    return false;
  }

  // A history entry written before the M2 search channel existed (#1548) is a
  // structurally-valid State WITHOUT `search` — `isState` accepts it (query is
  // optional for backward-compat, matching `getRouteFromEvent`), but
  // `areStatesEqual` reads both channels and throws on a missing one. Backfill
  // the empty query bag so a back/forward to a legacy entry compares (and can
  // skip) instead of crashing the popstate handler.
  // ⚑ `isState` now promises a RESTORABLE ENTRY, not a full `State` (#1838) —
  // it validates `name` / `path` / `params`, plus `search` / `transition` /
  // `context` WHEN PRESENT, and a history entry may legitimately carry none of
  // the last three. The cast below is therefore what it always was in fact, and
  // is now honest about it: `areStatesEqual` reads `name`, `params` and (when
  // not ignoring the query channel) `search`, and never touches `transition` or
  // `context` — checked in `StateNamespace.areStatesEqual`.
  const liveState = (
    (live as Partial<State>).search === undefined
      ? { ...live, search: {} }
      : live
  ) as State;

  return areStatesEqual(toState, liveState, false);
}
