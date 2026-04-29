import {
  createPopstateHandler,
  createPopstateLifecycle,
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
  updateBrowserState,
} from "./browser-env";
import { LOGGER_CONTEXT } from "./constants";
import { hashUrlToPath } from "./hash-utils";

import type { Browser, SharedFactoryState } from "./browser-env";
import type { HashPluginOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  Router,
  State,
  Plugin,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export class HashPlugin {
  readonly #router: Router;
  readonly #browser: Browser;
  readonly #removeStartInterceptor: () => void;
  readonly #removeExtensions: () => void;
  readonly #lifecycle: Pick<Plugin, "onStart" | "onStop" | "teardown">;
  readonly #warnHashIgnored!: () => void;

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

    // Hash limitation warn-once (#532). hash-plugin uses `#` as the route
    // delimiter, so URL fragments are structurally incompatible. Plugin
    // accepts the `hash` option for typing parity with browser/navigation
    // plugins, ignores it, and emits a single console.warn the first time
    // any consumer surfaces a hash. Existing `createWarnOnce` in browser-env
    // is SSR-specific (different signature) — inline pattern here.
    let hashWarned = false;
    const warnHashIgnored = (): void => {
      if (hashWarned) {
        return;
      }

      hashWarned = true;
      console.warn(
        "[@real-router/hash-plugin] `hash` option is ignored — `#` is reserved for the route delimiter. " +
          "URL fragments are not supported with hash-plugin; use @real-router/browser-plugin or " +
          "@real-router/navigation-plugin if you need them.",
      );
    };

    const urlPrefix = `${options.base}#${options.hashPrefix}`;
    const pluginBuildUrl = (
      route: string,
      params?: Params,
      opts?: { hash?: string },
    ) => {
      if (opts?.hash !== undefined) {
        warnHashIgnored();
      }

      return urlPrefix + router.buildPath(route, params);
    };

    this.#warnHashIgnored = warnHashIgnored;

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) =>
        api.matchPath(hashUrlToPath(url, prefixRegex)) ?? undefined,
      replaceHistoryState: createReplaceHistoryState(
        api,
        router,
        browser,
        pluginBuildUrl,
        false,
      ),
    });

    const handler = createPopstateHandler({
      router,
      api,
      browser,
      allowNotFound: api.getOptions().allowNotFound,
      transitionOptions,
      loggerContext: LOGGER_CONTEXT,
      buildUrl: pluginBuildUrl,
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
        // Hash limitation (#532): warn once if a consumer programmatically
        // requested a fragment via `router.navigate(..., { hash })`.
        if (navOptions.hash !== undefined) {
          this.#warnHashIgnored();
        }

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
