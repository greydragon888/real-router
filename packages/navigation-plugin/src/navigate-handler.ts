import { RouterError } from "@real-router/core";

import { extractPath } from "./browser-env/index.js";

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

function computeDirection(
  navigationType: NavigationMeta["navigationType"],
  destinationIndex: number,
  currentIndex: number,
): NavigationDirection {
  if (navigationType === "traverse") {
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
    if (!event.canIntercept) {
      return;
    }
    if (isSyncingFromRouter()) {
      return;
    }
    if (!router.isActive()) {
      return;
    }

    const destinationUrl = new URL(event.destination.url);
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

    if (matchedState) {
      event.intercept({
        handler: async () => {
          try {
            await router.navigate(matchedState.name, matchedState.params, {
              ...transitionOptions,
              signal: event.signal,
            });
          } catch (error) {
            if (!(error instanceof RouterError)) {
              recoverFromNavigateError(error, router, browser, setSyncing);
            }
          }
        },
      });
    } else if (allowNotFound) {
      event.intercept({
        handler: () => {
          router.navigateToNotFound(path);
        },
      });
    } else {
      event.intercept({
        handler: async () => {
          try {
            await router.navigateToDefault();
          } catch (error) {
            if (!(error instanceof RouterError)) {
              recoverFromNavigateError(error, router, browser, setSyncing);
            }
          }
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
      browser.navigate(url, {
        state: {
          name: currentState.name,
          params: currentState.params,
          path: currentState.path,
        },
        history: "replace",
      });
      setSyncing(false);
    }
  } catch (recoveryError) {
    console.error(
      "[navigation-plugin] Failed to recover from critical error",
      recoveryError,
    );
  }
}
