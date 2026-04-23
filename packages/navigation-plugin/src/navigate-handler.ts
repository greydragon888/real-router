import { errorCodes, RouterError } from "@real-router/core";

import { urlToPath } from "./browser-env";

import type {
  NavigationBrowser,
  NavigationDirection,
  NavigationMeta,
} from "./types";
import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

interface NavigateHandlerDeps {
  router: Router;
  api: PluginApi;
  browser: NavigationBrowser;
  isSyncingFromRouter: () => boolean;
  setSyncing: (value: boolean) => void;
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
  const {
    router,
    api,
    browser,
    isSyncingFromRouter,
    setSyncing,
    base,
    transitionOptions,
  } = deps;
  const { allowNotFound } = api.getOptions();

  return function handleNavigateEvent(event: NavigateEvent): void {
    if (!event.canIntercept || !router.isActive()) {
      return;
    }

    if (isSyncingFromRouter()) {
      // Plugin-originated navigate event after its own successful transition
      // (onTransitionSuccess calls browser.navigate to sync URL). We must still
      // intercept — a bare `return` leaves the event un-intercepted, and
      // Chromium falls back to a cross-document navigation (full page reload).
      // The noop handler cancels the fallback without running router logic;
      // state is already committed.
      event.intercept({
        handler: async () => {},
      });

      return;
    }

    const path = urlToPath(event.destination.url, base);
    const matchedState = api.matchPath(path);

    const navType = event.navigationType as NavigationMeta["navigationType"];
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

    const withRecovery = async (run: () => Promise<unknown>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        if (!(error instanceof RouterError)) {
          recoverFromNavigateError(error, router, browser, setSyncing);

          return;
        }

        // TRANSITION_CANCELLED: a newer navigation aborted this one — the
        // newer navigate event is (or will be) handled by this same plugin,
        // and THAT event is responsible for syncing URL/state. Firing our
        // own sync here races against it: browser.navigate(replace, same-url)
        // would cancel the in-flight newer transition, which is exactly the
        // rapid-fire-events storm failure mode.
        //
        // SAME_STATES: router refused because router.getState() already equals
        // the target. URL and router state are already consistent — no sync
        // needed.
        if (
          error.code === errorCodes.TRANSITION_CANCELLED ||
          error.code === errorCodes.SAME_STATES
        ) {
          return;
        }

        // Other RouterError codes (CANNOT_DEACTIVATE, CANNOT_ACTIVATE,
        // ROUTE_NOT_FOUND, …) — router rejected the transition, state is
        // unchanged, but URL may have already committed to a different
        // value by the Navigation API. Sync the URL back to the current
        // router state in a single visible transition (headless Chromium
        // and some cross-origin setups leave "committed-then-reverted"
        // windows if we relied on the native rollback via intercept reject).
        // Observers that care about the error see it through the router's
        // TRANSITION_ERROR event.
        syncUrlToRouterState(router, browser, setSyncing);
      }
    };

    if (matchedState) {
      event.intercept({
        handler: () =>
          withRecovery(() =>
            router.navigate(matchedState.name, matchedState.params, {
              ...transitionOptions,
              signal: event.signal,
            }),
          ),
      });
    } else if (allowNotFound) {
      event.intercept({
        handler: () => {
          router.navigateToNotFound(path);
        },
      });
    } else {
      // Strict mode — unmatched URL is an error. Emit $$error and reject the
      // intercept so the Navigation API auto-rolls back the URL. No silent
      // fallback to defaultRoute.
      event.intercept({
        // eslint-disable-next-line @typescript-eslint/require-await -- Navigation API requires async handler; synchronous throw is the rollback signal
        handler: async () => {
          const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, { path });

          api.emitTransitionError(err);

          throw err;
        },
      });
    }
  };
}

function recoverFromNavigateError(
  error: unknown,
  router: Router,
  browser: NavigationBrowser,
  setSyncing: (value: boolean) => void,
): void {
  console.error(
    "[navigation-plugin] Critical error in navigate handler",
    error,
  );

  syncUrlToRouterState(router, browser, setSyncing);
}

function syncUrlToRouterState(
  router: Router,
  browser: NavigationBrowser,
  setSyncing: (value: boolean) => void,
): void {
  try {
    const currentState = router.getState();

    if (currentState) {
      const url = router.buildUrl(currentState.name, currentState.params);

      setSyncing(true);

      try {
        browser.navigate(url, {
          state: {
            name: currentState.name,
            params: currentState.params,
            path: currentState.path,
          },
          history: "replace",
        });
      } finally {
        setSyncing(false);
      }
    }
  } catch (syncError) {
    console.error(
      "[navigation-plugin] Failed to sync URL to router state",
      syncError,
    );
  }
}
