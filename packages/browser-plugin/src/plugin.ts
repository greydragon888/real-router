import {
  createPopstateHandler,
  createPopstateLifecycle,
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
  updateBrowserState,
} from "browser-env";

import { buildUrl, urlToPath } from "./url-utils";

import type { BrowserPluginOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  PluginApi,
  Router,
  State,
  Plugin,
} from "@real-router/core";
import type { Browser, SharedFactoryState } from "browser-env";

export class BrowserPlugin {
  readonly #router: Router;
  readonly #browser: Browser;
  readonly #removeStartInterceptor: () => void;
  readonly #removeExtensions: () => void;
  readonly #lifecycle: Pick<Plugin, "onStart" | "onStop" | "teardown">;

  constructor(
    router: Router,
    api: PluginApi,
    options: Required<BrowserPluginOptions>,
    browser: Browser,
    transitionOptions: {
      source: string;
      replace: true;
      forceDeactivate?: boolean;
    },
    shared: SharedFactoryState,
  ) {
    this.#router = router;
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
      ),
    });

    const handler = createPopstateHandler({
      router,
      api,
      browser,
      allowNotFound: api.getOptions().allowNotFound,
      transitionOptions,
      loggerContext: "browser-plugin",
      buildUrl: (name: string, params?: Params) =>
        router.buildUrl(name, params),
    });

    this.#lifecycle = createPopstateLifecycle({
      browser,
      shared,
      handler,
      cleanup: () => {
        this.#removeStartInterceptor();
        this.#removeExtensions();
      },
    });
  }

  getPlugin(): Plugin {
    return {
      ...this.#lifecycle,

      onTransitionSuccess: (
        toState: State,
        fromState: State | undefined,
        navOptions: NavigationOptions,
      ) => {
        const replaceHistory = shouldReplaceHistory(
          navOptions,
          toState,
          fromState,
          this.#router,
        );

        const url = this.#router.buildUrl(toState.name, toState.params);

        const shouldPreserveHash =
          !fromState || fromState.path === toState.path;

        const finalUrl = shouldPreserveHash
          ? url + this.#browser.getHash()
          : url;

        updateBrowserState(toState, finalUrl, replaceHistory, this.#browser);
      },
    };
  }
}
