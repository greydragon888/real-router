import {
  createPopstateHandler,
  createPopstateLifecycle,
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
  updateBrowserState,
  buildUrl,
  urlToPath,
} from "./browser-env/index.js";
import { LOGGER_CONTEXT, source as POPSTATE_SOURCE } from "./constants";

import type { Browser, SharedFactoryState } from "./browser-env/index.js";
import type { BrowserContext, BrowserPluginOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  Router,
  State,
  Plugin,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export class BrowserPlugin {
  readonly #router: Router;
  readonly #browser: Browser;
  readonly #removeStartInterceptor: () => void;
  readonly #removeExtensions: () => void;
  readonly #claim: {
    write: (state: State, value: BrowserContext) => void;
    release: () => void;
  };
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
    this.#claim = api.claimContextNamespace("browser");

    this.#removeStartInterceptor = createStartInterceptor(api, browser);

    const pluginBuildUrl = (route: string, params?: Params) => {
      const path = router.buildPath(route, params);

      return buildUrl(path, options.base);
    };

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) => {
        const path = urlToPath(url, options.base, LOGGER_CONTEXT);

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
        this.#claim.release();
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
        );

        const url = this.#router.buildUrl(toState.name, toState.params);

        const shouldPreserveHash =
          !fromState || fromState.path === toState.path;

        const finalUrl = shouldPreserveHash
          ? url + this.#browser.getHash()
          : url;

        updateBrowserState(toState, finalUrl, replaceHistory, this.#browser);

        const isPopstate =
          (navOptions as Record<string, unknown>).source === POPSTATE_SOURCE;

        this.#claim.write(
          toState,
          Object.freeze({ source: isPopstate ? "popstate" : "navigate" }),
        );
      },
    };
  }
}
