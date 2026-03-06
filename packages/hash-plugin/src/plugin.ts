import {
  createPopstateHandler,
  createPopstateLifecycle,
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
  updateBrowserState,
} from "browser-env";

import { hashUrlToPath } from "./hash-utils";

import type { RegExpCache } from "./hash-utils";
import type { HashPluginOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  PluginApi,
  Router,
  State,
  Plugin,
} from "@real-router/core";
import type { Browser, SharedFactoryState } from "browser-env";

export class HashPlugin {
  readonly #router: Router;
  readonly #browser: Browser;
  readonly #removeStartInterceptor: () => void;
  readonly #removeExtensions: () => void;
  readonly #lifecycle: Pick<Plugin, "onStart" | "onStop" | "teardown">;

  constructor(
    router: Router,
    api: PluginApi,
    options: Required<HashPluginOptions>,
    browser: Browser,
    regExpCache: RegExpCache,
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

      return `${options.base}#${options.hashPrefix}${path}`;
    };

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) => {
        const path = hashUrlToPath(url, options.hashPrefix, regExpCache);

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
      transitionOptions,
      loggerContext: "hash-plugin",
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

        updateBrowserState(toState, url, replaceHistory, this.#browser);
      },
    };
  }
}
