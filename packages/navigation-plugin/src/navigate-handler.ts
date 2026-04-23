import { errorCodes, RouterError } from "@real-router/core";

import { extractPath, safeParseUrl } from "./browser-env";

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

    const destinationUrl = safeParseUrl(event.destination.url);
    const path =
      extractPath(destinationUrl.pathname, base) + destinationUrl.search;
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
        }
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
  } catch (recoveryError) {
    console.error(
      "[navigation-plugin] Failed to recover from critical error",
      recoveryError,
    );
  }
}
