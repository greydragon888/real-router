import { UNKNOWN_ROUTE } from "@real-router/core";
import { shouldReplaceHistory } from "browser-env";

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
import { buildUrl, extractPath, urlToPath } from "./url-utils";

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

function deriveNavigationType(
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
  readonly #lifecycle: Pick<Plugin, "onStart" | "onStop" | "teardown">;

  #isSyncingFromRouter = false;
  readonly #metaByState = new WeakMap<State, NavigationMeta>();
  #pendingMeta: NavigationMeta | undefined;
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

    this.#removeStartInterceptor = createStartInterceptor(api, browser);

    const pluginBuildUrl = (route: string, params?: Params) => {
      const path = router.buildPath(route, params);

      return buildUrl(path, options.base);
    };

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) => {
        const path = urlToPath(url, options.base);

        return path ? api.matchPath(path) : undefined;
      },
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
      getNavigationMeta: (state?: State): NavigationMeta | undefined => {
        if (!state) {
          return this.#pendingMeta;
        }

        return this.#metaByState.get(state);
      },
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
      setPendingMeta: (meta) => {
        this.#pendingMeta = meta;
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

    const parsedUrl = new URL(entry.url);
    const path =
      extractPath(parsedUrl.pathname, this.#options.base) + parsedUrl.search;
    const matchedState = this.#api.matchPath(path);

    if (!matchedState) {
      throw new Error(`No matching route for entry URL "${entry.url}"`);
    }

    this.#pendingMeta = {
      navigationType: "traverse",
      userInitiated: false,
    };
    this.#pendingTraverseKey = entry.key;

    return this.#router.navigate(matchedState.name, matchedState.params);
  }

  getPlugin(): Plugin {
    return {
      ...this.#lifecycle,

      onTransitionSuccess: (
        toState: State,
        fromState: State | undefined,
        navOptions: NavigationOptions,
      ) => {
        if (!this.#pendingMeta) {
          this.#pendingMeta = {
            navigationType: deriveNavigationType(
              navOptions,
              toState,
              fromState,
            ),
            userInitiated: false,
          };
        }

        this.#metaByState.set(toState, this.#pendingMeta);
        this.#pendingMeta = undefined;

        this.#isSyncingFromRouter = true;

        if (this.#pendingTraverseKey) {
          this.#browser.traverseTo(this.#pendingTraverseKey);
          this.#pendingTraverseKey = undefined;
        } else {
          const url = this.#router.buildUrl(toState.name, toState.params);
          const shouldPreserveHash =
            !fromState || fromState.path === toState.path;
          const finalUrl = shouldPreserveHash
            ? url + this.#browser.getHash()
            : url;
          const historyState = {
            name: toState.name,
            params: toState.params,
            path: toState.path,
          };

          if (toState.name === UNKNOWN_ROUTE) {
            this.#browser.updateCurrentEntry({ state: historyState });
          } else {
            const replace = shouldReplaceHistory(
              navOptions,
              toState,
              fromState,
            );

            this.#browser.navigate(finalUrl, {
              state: historyState,
              history: replace ? "replace" : "push",
            });
          }
        }

        this.#isSyncingFromRouter = false;
      },

      onTransitionCancel: () => {
        this.#pendingMeta = undefined;
        this.#pendingTraverseKey = undefined;
      },

      onTransitionError: () => {
        this.#pendingMeta = undefined;
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
    },
  };
}
