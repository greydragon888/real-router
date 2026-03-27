import {
  createPopstateHandler,
  createPopstateLifecycle,
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
  updateBrowserState,
} from "browser-env";

import { hashUrlToPath } from "./hash-utils";

import type { HashPluginOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  Router,
  State,
  Plugin,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";
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
    prefixRegex: RegExp | null,
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

    const urlPrefix = `${options.base}#${options.hashPrefix}`;
    const pluginBuildUrl = (route: string, params?: Params) =>
      urlPrefix + router.buildPath(route, params);

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) => {
        const path = hashUrlToPath(url, prefixRegex);

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
        );

        const url = this.#router.buildUrl(toState.name, toState.params);

        updateBrowserState(toState, url, replaceHistory, this.#browser);
      },
    };
  }
}
