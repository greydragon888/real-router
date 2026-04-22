import { UNKNOWN_ROUTE } from "@real-router/core";

import {
  shouldReplaceHistory,
  buildUrl,
  extractPathFromAbsoluteUrl,
  urlToPath,
} from "./browser-env";
import {
  peekBack,
  peekForward,
  hasVisited,
  getVisitedRoutes,
  getRouteVisitCount,
  findLastEntryForRoute,
  canGoBack,
  canGoForward,
  canGoBackTo,
} from "./history-extensions";
import { createNavigateHandler } from "./navigate-handler";
import {
  createStartInterceptor,
  createReplaceHistoryState,
} from "./plugin-utils";

import type {
  NavigationBrowser,
  NavigationMeta,
  NavigationPluginOptions,
  NavigationSharedState,
} from "./types";
import type {
  NavigationOptions,
  Params,
  Router,
  State,
  Plugin,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export function deriveNavigationType(
  navOptions: NavigationOptions,
  toState: State,
  fromState: State | undefined,
): NavigationMeta["navigationType"] {
  if (navOptions.reload && toState.path === fromState?.path) {
    return "reload";
  }

  if (shouldReplaceHistory(navOptions, toState, fromState)) {
    return "replace";
  }

  return "push";
}

export class NavigationPlugin {
  readonly #router: Router;
  readonly #api: PluginApi;
  readonly #options: Required<NavigationPluginOptions>;
  readonly #browser: NavigationBrowser;
  readonly #removeStartInterceptor: () => void;
  readonly #removeExtensions: () => void;
  readonly #claim: {
    write: (state: State, value: NavigationMeta) => void;
    release: () => void;
  };
  readonly #lifecycle: Pick<Plugin, "onStart" | "onStop" | "teardown">;

  #isSyncingFromRouter = false;
  #capturedMeta: NavigationMeta | undefined;
  #pendingTraverseKey: string | undefined;

  constructor(
    router: Router,
    api: PluginApi,
    options: Required<NavigationPluginOptions>,
    browser: NavigationBrowser,
    transitionOptions: {
      source: string;
      replace: true;
      forceDeactivate?: boolean;
    },
    shared: NavigationSharedState,
  ) {
    this.#router = router;
    this.#api = api;
    this.#options = options;
    this.#browser = browser;

    this.#claim = api.claimContextNamespace("navigation");
    this.#removeStartInterceptor = createStartInterceptor(api, browser);

    const pluginBuildUrl = (route: string, params?: Params) => {
      const path = router.buildPath(route, params);

      return buildUrl(path, options.base);
    };

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) =>
        api.matchPath(urlToPath(url, options.base)) ?? undefined,
      replaceHistoryState: createReplaceHistoryState(
        api,
        router,
        browser,
        pluginBuildUrl,
        (syncing) => {
          this.#isSyncingFromRouter = syncing;
        },
      ),

      peekBack: () => peekBack(browser, api, options.base),
      peekForward: () => peekForward(browser, api, options.base),
      hasVisited: (routeName: string) =>
        hasVisited(browser, api, options.base, routeName),
      getVisitedRoutes: () => getVisitedRoutes(browser, api, options.base),
      getRouteVisitCount: (routeName: string) =>
        getRouteVisitCount(browser, api, options.base, routeName),
      traverseToLast: (routeName: string) => this.traverseToLast(routeName),
      canGoBack: () => canGoBack(browser),
      canGoForward: () => canGoForward(browser),
      canGoBackTo: (routeName: string) =>
        canGoBackTo(browser, api, options.base, routeName),
    });

    const handler = createNavigateHandler({
      router,
      api,
      browser,
      isSyncingFromRouter: () => this.#isSyncingFromRouter,
      setSyncing: (syncing) => {
        this.#isSyncingFromRouter = syncing;
      },
      setCapturedMeta: (meta) => {
        this.#capturedMeta = meta;
      },
      base: options.base,
      transitionOptions,
    });

    this.#lifecycle = createNavigateLifecycle({
      browser,
      shared,
      handler,
      removeStartInterceptor: this.#removeStartInterceptor,
      removeExtensions: this.#removeExtensions,
      releaseClaim: () => {
        this.#claim.release();
      },
    });
  }

  async traverseToLast(routeName: string): Promise<State> {
    const entries = this.#browser.entries();
    const currentKey = this.#browser.currentEntry?.key;
    const entry = findLastEntryForRoute(
      entries,
      routeName,
      this.#api,
      this.#options.base,
      currentKey,
    );

    if (!entry) {
      throw new Error(`No history entry for route "${routeName}"`);
    }

    if (!entry.url) {
      throw new Error(`No matching route for entry URL "${entry.url}"`);
    }

    const path = extractPathFromAbsoluteUrl(entry.url, this.#options.base);
    const matchedState = this.#api.matchPath(path);

    if (!matchedState) {
      throw new Error(`No matching route for entry URL "${entry.url}"`);
    }

    /* v8 ignore next -- @preserve: currentEntry always exists when traverseToLast is callable (after start) */
    const currentIndex = this.#browser.currentEntry?.index ?? -1;

    this.#capturedMeta = {
      navigationType: "traverse",
      userInitiated: false,
      direction: entry.index > currentIndex ? "forward" : "back",
      sourceElement: null,
    };
    this.#pendingTraverseKey = entry.key;

    return this.#router.navigate(matchedState.name, matchedState.params);
  }

  getPlugin(): Plugin {
    return {
      ...this.#lifecycle,

      onTransitionStart: (toState: State) => {
        if (this.#capturedMeta) {
          this.#claim.write(toState, this.#capturedMeta);
        }
      },

      onTransitionSuccess: (
        toState: State,
        fromState: State | undefined,
        navOptions: NavigationOptions,
      ) => {
        if (!this.#capturedMeta) {
          const navigationType = deriveNavigationType(
            navOptions,
            toState,
            fromState,
          );

          this.#capturedMeta = {
            navigationType,
            userInitiated: false,
            direction: navigationType === "push" ? "forward" : "unknown",
            sourceElement: null,
          };
        }

        const { navigationType } = this.#capturedMeta;

        this.#claim.write(toState, Object.freeze(this.#capturedMeta));
        this.#capturedMeta = undefined;

        this.#isSyncingFromRouter = true;

        try {
          if (this.#pendingTraverseKey) {
            this.#browser.traverseTo(this.#pendingTraverseKey);
            this.#pendingTraverseKey = undefined;
          } else {
            const url = buildUrl(toState.path, this.#options.base);
            const shouldPreserveHash =
              !fromState || fromState.path === toState.path;
            const hash = shouldPreserveHash ? this.#browser.getHash() : "";
            const finalUrl = hash ? url + hash : url;
            const historyState = {
              name: toState.name,
              params: toState.params,
              path: toState.path,
            };

            if (toState.name === UNKNOWN_ROUTE) {
              this.#browser.updateCurrentEntry({ state: historyState });
            } else {
              const replace = navigationType !== "push";

              this.#browser.navigate(finalUrl, {
                state: historyState,
                history: replace ? "replace" : "push",
              });
            }
          }
        } finally {
          this.#isSyncingFromRouter = false;
        }
      },

      onTransitionCancel: () => {
        this.#capturedMeta = undefined;
        this.#pendingTraverseKey = undefined;
      },

      onTransitionError: () => {
        this.#capturedMeta = undefined;
        this.#pendingTraverseKey = undefined;
      },
    };
  }
}

interface NavigateLifecycleDeps {
  browser: NavigationBrowser;
  handler: (event: NavigateEvent) => void;
  removeStartInterceptor: () => void;
  removeExtensions: () => void;
  releaseClaim: () => void;
  shared: NavigationSharedState;
}

function createNavigateLifecycle(deps: NavigateLifecycleDeps): Plugin {
  return {
    onStart() {
      deps.shared.removeNavigateListener?.();
      deps.shared.removeNavigateListener = deps.browser.addNavigateListener(
        deps.handler,
      );
    },

    onStop() {
      deps.shared.removeNavigateListener?.();
      deps.shared.removeNavigateListener = undefined;
    },

    teardown() {
      deps.shared.removeNavigateListener?.();
      deps.shared.removeNavigateListener = undefined;
      deps.removeStartInterceptor();
      deps.removeExtensions();
      deps.releaseClaim();
    },
  };
}
