import { errorCodes, RouterError } from "@real-router/core";
import { freezeThrownError } from "@real-router/core/utils";

import { urlToPathAndHash } from "./browser-env";
import { PLUGIN_SYNC_INFO } from "./navigation-browser";

import type {
  NavigationBrowser,
  NavigationDirection,
  NavigationMeta,
} from "./types";
import type { Router } from "@real-router/core";
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

interface NavigateHandlerDeps {
  router: Router;
  api: PluginApi;
  browser: NavigationBrowser;
  setCapturedMeta: (meta: NavigationMeta) => void;
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
  const { router, api, browser, base, transitionOptions } = deps;
  const { allowNotFound } = api.getOptions();
  // The signal of the last navigation this handler took to a matched route,
  // until the plugin next writes the router's own URL.
  let taken: AbortSignal | undefined;

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
      // navigation the router never sees. Put the URL back here (#2724) — on
      // the next task: a navigation started during this event cancels the
      // download (measured on Chromium 153).
      // A navigation the router takes before then owns the URL instead; a
      // stopped router holds no state, so the write finds nothing to restore.
      if (taken?.aborted) {
        taken = undefined;
        setTimeout(() => {
          if (taken === undefined) {
            syncUrlToRouterState(router, browser);
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
    const currentIndex = browser.currentEntry?.index ?? -1;

    deps.setCapturedMeta({
      navigationType: navType,
      userInitiated: event.userInitiated,
      info: event.info,
      direction: computeDirection(
        navType,
        event.destination.index,
        currentIndex,
      ),
      sourceElement: event.sourceElement ?? null,
    });

    if (matchedState) {
      taken = event.signal;
      event.intercept({
        handler: () =>
          withRecovery(
            () =>
              // api.navigateToState: matchPath already applied forwardState +
              // matchSourceTrailingSlash; reusing the State avoids the redundant
              // round-trip and preserves trailing slashes (#525). Plugin-only
              // entry point — not on the public Router/Navigator surface.
              //
              // Hash extraction (#532): pass through the destination's hash so
              // onTransitionSuccess sets state.context.url.hash. When the
              // browser fires hashChange (same-document fragment-only nav),
              // add force+hashChange to bypass SAME_STATES — subscribers
              // disambiguate via state.context.url.hashChanged, not via the
              // overloaded force flag.
              api.navigateToState(matchedState, {
                ...transitionOptions,
                hash,
                ...(event.hashChange && { force: true, hashChange: true }),
                signal: event.signal,
              }),
            router,
            browser,
          ),
      });
    } else if (allowNotFound) {
      event.intercept({
        handler: () => {
          router.navigateToNotFound(path);
        },
      });
    } else {
      // Strict mode — an unmatched URL that stays in this document is an
      // error. Emit $$error and reject the intercept; no silent fallback to
      // defaultRoute. The rejection leaves the URL where the navigation put it
      // (#2740).
      event.intercept({
        // eslint-disable-next-line @typescript-eslint/require-await -- Navigation API requires async handler; the throw rejects the intercept
        handler: async () => {
          const err = freezeThrownError(
            new RouterError(errorCodes.ROUTE_NOT_FOUND, { path }),
          );

          api.emitTransitionError(err);

          throw err;
        },
      });
    }
  };
}

/**
 * Module-scope helper hoisted out of handleNavigateEvent so the closure is
 * not re-allocated on every navigate event. The router/browser refs come from
 * arguments instead of an enclosing scope; identical behaviour, fewer GC'd
 * closures.
 */
async function withRecovery(
  run: () => Promise<unknown>,
  router: Router,
  browser: NavigationBrowser,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof RouterError)) {
      recoverFromNavigateError(error, router, browser);

      return;
    }

    // TRANSITION_CANCELLED: a newer navigation aborted this one — the newer
    // navigate event is (or will be) handled by this same plugin, and THAT
    // event is responsible for syncing URL/state. Firing our own sync here
    // races against it: browser.navigate(replace, same-url) would cancel the
    // in-flight newer transition, which is exactly the rapid-fire-events storm
    // failure mode.
    //
    // SAME_STATES: router refused because router.getState() already equals the
    // target. URL and router state are already consistent — no sync needed.
    if (
      error.code === errorCodes.TRANSITION_CANCELLED ||
      error.code === errorCodes.SAME_STATES
    ) {
      return;
    }

    // Other RouterError codes (CANNOT_DEACTIVATE, CANNOT_ACTIVATE,
    // ROUTE_NOT_FOUND, …) — router rejected the transition, state is
    // unchanged, but the Navigation API has already committed the URL, and it
    // does not roll an intercepted navigation back when the handler rejects
    // (#2740). Sync the URL back to the current router state. Observers that
    // care about the error see it through the router's TRANSITION_ERROR event.
    syncUrlToRouterState(router, browser);
  }
}

function recoverFromNavigateError(
  error: unknown,
  router: Router,
  browser: NavigationBrowser,
): void {
  console.error(
    "[navigation-plugin] Critical error in navigate handler",
    error,
  );

  syncUrlToRouterState(router, browser);
}

function syncUrlToRouterState(
  router: Router,
  browser: NavigationBrowser,
): void {
  try {
    const currentState = router.getState();

    if (currentState) {
      // Preserve hash on recovery (#532): reading from state.context.url
      // keeps the visible URL fragment intact when a guard rejects a hash-
      // bearing navigation.
      const ctxHash = (
        currentState.context as { url?: { hash?: string } } | undefined
      )?.url?.hash;
      const url = router.buildUrl(
        currentState.name,
        currentState.params,
        // Query channel at position 3 (RFC-4 M2 / #1548), hash opts at 4. The
        // state's own `search` goes in it (#1586): recovery rebuilds the URL of
        // the state that SURVIVED the rejection, so dropping its query would
        // leave the user on a URL the router itself does not hold.
        currentState.search,
        ctxHash ? { hash: ctxHash } : undefined,
      );

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
    }
  } catch (syncError) {
    console.error(
      "[navigation-plugin] Failed to sync URL to router state",
      syncError,
    );
  }
}
