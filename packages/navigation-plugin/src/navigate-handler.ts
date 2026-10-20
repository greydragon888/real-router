import { errorCodes, RouterError } from "@real-router/core";
import { freezeThrownError } from "@real-router/core/utils";

import { normalizeHashInput, urlToPathAndHash } from "./browser-env";
import { buildEntryUrl, isSameHref } from "./href-utils";
import { PLUGIN_SYNC_INFO } from "./navigation-browser";

import type {
  NavigationBrowser,
  NavigationDirection,
  NavigationMeta,
} from "./types";
import type { Router, State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

// Hoisted noop intercept options — reused on every plugin-originated
// navigate event (the hot path). `event.intercept` reads `handler` once per
// call per Navigation API spec, so a shared object/function is safe and
// saves two allocations per intercepted event.
//
// `scroll: "manual"` is critical for plugin-originated re-emits: by the time
// the navigate event fires for a router-driven mutation (e.g. scroll-spy's
// hash-only nav, scroll-restoration's URL sync), the router has already
// committed the transition and the app owns scroll position. Default
// `scroll: "after-transition"` would auto-scroll the new URL fragment into
// view, fighting against the user's own scroll motion (concrete bug:
// scroll-spy + slow user scroll → viewport jump on every emit).
// Aligns with browser-plugin (History API has no auto-scroll on
// programmatic URL changes). Apps that want hash-anchor auto-scroll opt
// in via `createScrollRestoration({ anchorScrolling: true })`.
const NOOP_ASYNC = async (): Promise<void> => {};
const NOOP_INTERCEPT: NavigationInterceptOptions = {
  handler: NOOP_ASYNC,
  scroll: "manual",
};

/** A navigation the handler took. */
interface Taken {
  readonly signal: AbortSignal;
  /** The key of the entry the router stood on. */
  readonly from: string | undefined;
  /** That entry's id: a `replace` keeps an entry's key and changes its id. */
  readonly fromId: string | undefined;
  /** That entry's URL. */
  readonly fromUrl: string | null | undefined;
  /** The router's state then; a navigation committed since owns the URL. */
  readonly state: State | undefined;
}

interface NavigateHandlerDeps {
  router: Router;
  api: PluginApi;
  browser: NavigationBrowser;
  /** Stages `meta` for the transition `start` begins (`NavigationPlugin`). */
  stage: <T>(meta: NavigationMeta, start: () => T) => T;
  /** Stages `meta` for the commit `commit` makes without a transition. */
  stageCommit: <T>(meta: NavigationMeta, commit: () => T) => T;
  base: string;
  transitionOptions: {
    source: string;
    replace: true;
    forceDeactivate?: boolean;
  };
}

export function computeDirection(
  navigationType: NavigationMeta["navigationType"],
  destinationIndex: number,
  currentIndex: number,
): NavigationDirection {
  if (navigationType === "traverse") {
    if (destinationIndex === currentIndex) {
      return "unknown";
    }

    return destinationIndex > currentIndex ? "forward" : "back";
  }

  return navigationType === "push" ? "forward" : "unknown";
}

export function createNavigateHandler(deps: NavigateHandlerDeps) {
  const { router, api, browser, stage, stageCommit, base, transitionOptions } =
    deps;
  const { allowNotFound } = api.getOptions();
  // The last navigation this handler took, until the router reaches its
  // destination or the plugin next writes the router's own URL.
  let taken: Taken | undefined;

  return function handleNavigateEvent(event: NavigateEvent): void {
    if (!event.canIntercept || !router.isActive()) {
      return;
    }

    if (event.info === PLUGIN_SYNC_INFO) {
      taken = undefined;

      // Plugin-originated navigate event after its own successful transition
      // (onTransitionSuccess calls browser.navigate to sync URL). We must still
      // intercept — a bare `return` leaves the event un-intercepted, and
      // Chromium falls back to a cross-document navigation (full page reload).
      // The noop handler cancels the fallback without running router logic;
      // state is already committed.
      //
      // Detection by `event.info` (identity) instead of a synchronous flag
      // (timing) so this works under Safari 26.2 WKWebView, which delivers
      // navigate events on a subsequent task — by then a `finally`-cleared
      // flag would already be false and the handler would loop (#580).
      //
      // NOOP_INTERCEPT is module-level so the intercept options + handler
      // are not re-allocated per navigation (hot path).
      event.intercept(NOOP_INTERCEPT);

      return;
    }

    // The browser performs these itself: a download, a POST whose body the
    // router has no channel for, and a reload of the document (#2724).
    if (event.downloadRequest != null) {
      // A download keeps this document, and starting one aborts a navigation
      // the router is still taking: its URL stays committed while the router
      // stays put, and `withRecovery` leaves the cancelled one to a newer
      // navigation the router never sees. Return to the router's entry here
      // (#2724, #2740) — on the next task: a navigation started during this
      // event cancels the download (measured on Chromium 153).
      // A navigation the router takes or commits before then owns the URL
      // instead, and a stopped router owns none.
      const aborted = taken;

      if (aborted?.signal.aborted) {
        taken = undefined;
        setTimeout(() => {
          if (taken === undefined) {
            returnToOrigin(router, browser, aborted, base);
          }
        }, 0);
      }

      return;
    }

    if (event.formData != null || event.navigationType === "reload") {
      return;
    }

    const { path, hash } = urlToPathAndHash(event.destination.url, base);
    const matchedState = api.matchPath(path);

    // A URL with no route is the router's only while the navigation stays in
    // this document; otherwise the browser loads that page (#2724).
    if (!matchedState && !event.destination.sameDocument) {
      return;
    }

    const navType = event.navigationType;
    // The event fires before the commit: the browser still stands on the
    // entry the navigation starts from.
    const origin = browser.currentEntry;
    const state = router.getState();
    const record = take(event.signal, taken, origin, state);

    taken = record;

    // Read off the event, whose origin entry the commit replaces; staged by the
    // handler, right before the transition that publishes it. A navigation a
    // redirect holds commits a microtask later (#2751), and a router
    // navigation started in between must not take its metadata.
    const meta: NavigationMeta = {
      navigationType: navType,
      userInitiated: event.userInitiated,
      info: event.info,
      direction: computeDirection(
        navType,
        event.destination.index,
        origin?.index ?? -1,
      ),
      sourceElement: event.sourceElement ?? null,
    };

    if (matchedState) {
      // A fragment the router has not published needs a transition on the
      // route it shows: the browser's fragment-only navigation, and a URL the
      // router rewrites — an alias of that route — with another fragment
      // (#2744). A fragment that changes on the router's own path and query,
      // as a third party's `history.replaceState(null, "", "#x")` changes
      // it, starts no transition.
      const hashChange =
        event.hashChange ||
        (state?.path === matchedState.path &&
          path !== state.path &&
          hash !==
            ((state.context as { url?: { hash?: string } } | undefined)?.url
              ?.hash ?? ""));

      event.intercept({
        // A router still starting gets the navigation committed within the
        // call: its start can settle in the microtask a redirect holds the
        // commit, and the navigation would no longer supersede it.
        ...(state &&
          redirectBeforeCommit(event, matchedState.path, hash, base)),
        handler: async () => {
          const arrived = await withRecovery(
            () =>
              stage(meta, () =>
                // api.navigateToState: matchPath already applied forwardState
                // + matchSourceTrailingSlash; reusing the State avoids the
                // redundant round-trip and preserves trailing slashes (#525).
                // Plugin-only entry point — not on the public
                // Router/Navigator surface.
                //
                // Hash extraction (#532): pass through the destination's hash
                // so onTransitionSuccess sets state.context.url.hash. A
                // fragment change adds force+hashChange to bypass
                // SAME_STATES — subscribers disambiguate via
                // state.context.url.hashChanged, not via the overloaded force
                // flag.
                api.navigateToState(matchedState, {
                  ...transitionOptions,
                  hash,
                  ...(hashChange && { force: true, hashChange: true }),
                  signal: event.signal,
                }),
              ),
            router,
            browser,
            record,
            base,
          );

          if (arrived) {
            taken = undefined;
            scrollIfAborted(event);
          }
        },
      });
    } else if (allowNotFound) {
      event.intercept({
        handler: () => {
          // A navigation a newer one aborted before this handler ran gets no
          // scroll from the plugin: that one owns it.
          const superseded = event.signal.aborted;

          try {
            // navigateToNotFound() takes no signal: it lands either way.
            stageCommit(meta, () => router.navigateToNotFound(path));
          } catch (error) {
            // The router refused to leave the current route (#2740).
            returnToOrigin(router, browser, record, base);

            throw error;
          }

          if (!superseded) {
            scrollIfAborted(event);
          }
        },
      });
    } else {
      // Strict mode — an unmatched URL that stays in this document is an
      // error. Emit $$error, return to the entry the navigation started from
      // and reject the intercept; no silent fallback to defaultRoute (#2740).
      event.intercept({
        // eslint-disable-next-line @typescript-eslint/require-await -- Navigation API requires async handler; the throw rejects the intercept
        handler: async () => {
          const err = freezeThrownError(
            new RouterError(errorCodes.ROUTE_NOT_FOUND, { path }),
          );

          api.emitTransitionError(err);
          returnToOrigin(router, browser, record, base);

          throw err;
        },
      });
    }
  };
}

/**
 * A navigation the handler takes, from the entry the router stands on: the
 * origin, unless an earlier navigation it took has not brought it to its
 * destination — cancelled, or still running: the browser has committed that
 * one's entry, and the router has not moved.
 */
function take(
  signal: AbortSignal,
  earlier: Taken | undefined,
  origin: NavigationHistoryEntry | null,
  state: State | undefined,
): Taken {
  const { from, fromId, fromUrl } =
    earlier !== undefined && earlier.state === state
      ? earlier
      : { from: origin?.key, fromId: origin?.id, fromUrl: origin?.url };

  return { signal, from, fromId, fromUrl, state };
}

/**
 * The router lands on the matched state's path: `forwardTo` and the defaults
 * are already applied. A navigation that leaves the document gets that URL
 * before its commit, so the plugin's write after the transition has nothing to
 * rewrite (#2751). That write is a navigation of its own: it aborts this one,
 * and the browser skips the scroll it applies when a navigation finishes.
 *
 * A same-document navigation commits without a redirect: with a precommit
 * handler, `history.pushState()` returns before the URL changes, and
 * `redirect()` refuses a traversal, which the handler takes only within the
 * document (measured on Chromium 153, Firefox 155 and WebKit 26.6). So does
 * every navigation in a browser without precommit handlers, which ignores the
 * option.
 */
function redirectBeforeCommit(
  event: NavigateEvent,
  path: string,
  hash: string,
  base: string,
): Pick<NavigationInterceptOptions, "precommitHandler"> | undefined {
  // The fragment as `onTransitionSuccess` publishes it, so the write finds the
  // entry at its own URL.
  const url = buildEntryUrl(path, normalizeHashInput(hash), base);

  if (
    event.destination.sameDocument ||
    isSameHref(url, event.destination.url)
  ) {
    return undefined;
  }

  return {
    precommitHandler: (controller) => {
      // A precommit handler that throws cancels the navigation outright
      // (measured on Chromium 153, Firefox 155 and WebKit 26.6). A refused
      // redirect leaves it to commit the URL it was given, and the plugin's
      // write after the transition rewrites that URL.
      try {
        controller.redirect(url);
      } catch {
        // The URL it was given commits.
      }
    },
  };
}

/**
 * A write after the transition aborted this navigation: the plugin's, on one
 * {@link redirectBeforeCommit} left alone, or the app's, as the router lands.
 * The browser applies no scroll to an aborted navigation, so the plugin asks
 * for the one it skipped (#2751).
 *
 * A traversal gets its position back only in Chromium; Firefox and WebKit
 * end at the top (measured on Firefox 155 and WebKit 26.6).
 *
 * The scroll comes even when another listener intercepted the navigation
 * with `scroll: "manual"`, which the event does not report (measured on
 * Chromium 153, Firefox 155 and WebKit 26.6). A navigation scrolls once: that
 * listener's own `event.scroll()` afterwards throws.
 */
function scrollIfAborted(event: NavigateEvent): void {
  if (event.signal.aborted) {
    event.scroll();
  }
}

/**
 * Module-scope helper hoisted out of handleNavigateEvent so the closure is
 * not re-allocated on every navigate event. The router, browser and base come
 * from arguments instead of an enclosing scope; identical behaviour, fewer
 * GC'd closures.
 */
/**
 * Runs the router's transition for a navigation the handler took, and
 * answers whether the router stands on its destination: `false` when a
 * newer navigation cancelled it. A refusal or a crash rejects.
 */
async function withRecovery(
  run: () => Promise<unknown>,
  router: Router,
  browser: NavigationBrowser,
  taken: Taken,
  base: string,
): Promise<boolean> {
  try {
    await run();

    return true;
  } catch (error) {
    if (!(error instanceof RouterError)) {
      recoverFromNavigateError(error, router, browser, taken, base);

      throw error;
    }

    // TRANSITION_CANCELLED: a newer navigation aborted this one — the newer
    // navigate event is (or will be) handled by this same plugin, and THAT
    // event is responsible for syncing URL/state. Firing our own sync here
    // races against it: browser.navigate(replace, same-url) would cancel the
    // in-flight newer transition, which is exactly the rapid-fire-events storm
    // failure mode.
    //
    // SAME_STATES: the router already shows the target state, but the entry
    // the browser committed can carry an alias of it — a `forwardTo` source,
    // a trailing slash the router strips. The entry gets the router's URL, as
    // the History API plugins resync it (#2744); a URL that differs only in
    // its fragment keeps it. A navigation a newer one has aborted writes
    // nothing and keeps the newer one's record, for the reason above: the
    // newer one owns the URL.
    if (error.code === errorCodes.TRANSITION_CANCELLED) {
      return false;
    }

    if (error.code === errorCodes.SAME_STATES) {
      if (taken.signal.aborted) {
        return false;
      }

      if (standsOnAlias(router, browser, base)) {
        syncUrlToRouterState(router, browser, base);
      }

      return true;
    }

    // Other RouterError codes (CANNOT_DEACTIVATE, CANNOT_ACTIVATE,
    // ROUTE_NOT_FOUND, …) — router rejected the transition, state is
    // unchanged, but the Navigation API has already committed the navigation,
    // and it does not roll an intercepted navigation back when the handler
    // rejects.
    returnToOrigin(router, browser, taken, base);

    // The intercept rejects with the refusal: a navigation that finishes
    // has the browser apply its scroll to the page the router stayed on.
    throw error;
  }
}

function recoverFromNavigateError(
  error: unknown,
  router: Router,
  browser: NavigationBrowser,
  taken: Taken,
  base: string,
): void {
  console.error(
    "[navigation-plugin] Critical error in navigate handler",
    error,
  );

  returnToOrigin(router, browser, taken, base);
}

/**
 * Takes the browser back to the entry the router stood on when it took a
 * navigation it refused (#2740). The browser stands on the refused
 * destination; rewriting that entry with the router's URL would replace the
 * page the user meant to reach with a copy of the one they stayed on, so it is
 * left in place.
 *
 * A `replace` keeps the key of the entry it replaces, so origin and
 * destination are one entry: that entry is rewritten with the router's URL.
 * So is the current one when the origin is unknown or gone, or the browser
 * does not travel. A navigation the router committed since owns the URL, and
 * nothing is written.
 */
function returnToOrigin(
  router: Router,
  browser: NavigationBrowser,
  taken: Taken,
  base: string,
): void {
  if (router.getState() !== taken.state) {
    return;
  }

  const current = browser.currentEntry;

  // The browser never left the entry the router stood on: a navigation a
  // redirect held before its commit, cancelled there by a download (#2751).
  // A custom browser's entries without an id leave it to the key below, and
  // the URL tells apart entries whose id a replace keeps.
  if (
    taken.fromId !== undefined &&
    current?.id === taken.fromId &&
    current.url === taken.fromUrl
  ) {
    return;
  }

  try {
    const origin = browser.entries().find((entry) => entry.key === taken.from);

    if (origin && origin.key !== browser.currentEntry?.key) {
      browser.traverseTo(origin.key);

      return;
    }
  } catch (error) {
    console.error(
      "[navigation-plugin] Failed to return to the entry the navigation started from",
      error,
    );
  }

  syncUrlToRouterState(router, browser, base);
}

/**
 * Whether the browser stands on another path or query than the router's state
 * — an alias of it, such as a `forwardTo` source. A URL that differs only in
 * its fragment is not one, and neither is an entry whose URL is unknown.
 */
function standsOnAlias(
  router: Router,
  browser: NavigationBrowser,
  base: string,
): boolean {
  const url = browser.currentEntry?.url;

  return (
    url !== undefined &&
    url !== null &&
    urlToPathAndHash(url, base).path !== router.getState()?.path
  );
}

function syncUrlToRouterState(
  router: Router,
  browser: NavigationBrowser,
  base: string,
): void {
  const currentState = router.getState();

  if (!currentState) {
    return;
  }

  try {
    // The URL is the state's own path, query included (#1586), as
    // `onTransitionSuccess` writes it: a rebuild from the route name drops
    // the trailing slash `trailingSlash: "preserve"` keeps in `state.path`.
    // Preserve hash on recovery (#532): reading from state.context.url
    // keeps the visible URL fragment intact when a guard rejects a hash-
    // bearing navigation.
    const ctxHash = (
      currentState.context as { url?: { hash?: string } } | undefined
    )?.url?.hash;
    const url = buildEntryUrl(currentState.path, ctxHash ?? "", base);

    // An entry whose URL already is the router's is left alone, as
    // `onTransitionSuccess` leaves it (#580): the write would abort the
    // browser's navigation for nothing (#2751).
    if (isSameHref(url, browser.currentEntry?.url)) {
      return;
    }

    // browser.navigate inside `createNavigationBrowser` tags `info` with
    // PLUGIN_SYNC_INFO so the navigate event this fires is recognised by
    // the handler and short-circuited — no manual flag management here.
    browser.navigate(url, {
      state: {
        name: currentState.name,
        params: currentState.params,
        // The buffered entry state is two-channel since RFC-4 M2 (#1548) —
        // see the shape documented in CLAUDE.md. Omitting `search` here made
        // the recovery path the one writer producing a narrower entry than
        // every other, so a reader restoring from it saw a state the router
        // never held (#1586).
        search: currentState.search,
        path: currentState.path,
      },
      history: "replace",
    });
  } catch (syncError) {
    console.error(
      "[navigation-plugin] Failed to sync URL to router state",
      syncError,
    );
  }
}
