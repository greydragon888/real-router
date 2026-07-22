import {
  canSkipPopstateHistoryWrite,
  createPopstateHandler,
  createHashSyncLifecycle,
  createStartInterceptor,
  createReplaceHistoryState,
  shouldReplaceHistory,
  updateBrowserState,
} from "./browser-env";
import { LOGGER_CONTEXT, source as POPSTATE_SOURCE } from "./constants";
import { hashUrlToPath } from "./hash-utils";

import type { Browser, SharedFactoryState } from "./browser-env";
import type { HashPluginOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  Router,
  SearchParams,
  State,
  Plugin,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export class HashPlugin {
  readonly #router: Router;
  readonly #browser: Browser;
  readonly #urlPrefix: string;
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

    this.#urlPrefix = `${options.base}#${options.hashPrefix}`;
    const pluginBuildUrl = (
      route: string,
      params?: Params,
      search?: SearchParams,
      opts?: { hash?: string },
    ) => {
      if (opts?.hash !== undefined) {
        warnHashIgnored();
      }

      // Search-aware buildPath (RFC-4 M2 / #1548): the query comes from the
      // explicit `search` channel when supplied.
      return this.#urlPrefix + router.buildPath(route, params, search);
    };

    this.#warnHashIgnored = warnHashIgnored;

    const replaceHistoryStateImpl = createReplaceHistoryState(
      api,
      router,
      browser,
      pluginBuildUrl,
      false,
    );

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) =>
        api.matchPath(hashUrlToPath(url, prefixRegex)) ?? undefined,
      // #532/#1230: hash-plugin ignores URL fragments (`#` is the route
      // delimiter). Warn once and drop `{ hash }` — mirroring buildUrl/navigate.
      // Without this, createReplaceHistoryState's explicit-hash branch splices
      // "#x" into the hash-route URL regardless of preserveHash=false.
      replaceHistoryState: (
        name: string,
        params?: Params,
        search?: SearchParams,
        opts?: { hash?: string },
      ) => {
        if (opts?.hash !== undefined) {
          warnHashIgnored();
        }

        replaceHistoryStateImpl(name, params, search);
      },
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

    this.#lifecycle = createHashSyncLifecycle({
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

        const isPopstate = navOptions.source === POPSTATE_SOURCE;

        // On back/forward the browser has already restored the target entry's
        // {name,params,path} + URL, so hash-plugin's replaceState re-writes the
        // same values — a value-level no-op that still fires a second
        // updateForSameDocumentNavigation Blink event. Skip it when provably a
        // no-op; every load-bearing case (redirect, normalization, corrupted
        // history.state) keeps the write. (#1353)
        const skipHistoryWrite =
          isPopstate &&
          replaceHistory &&
          canSkipPopstateHistoryWrite(
            toState,
            this.#browser,
            this.#router.areStatesEqual,
          );

        if (!skipHistoryWrite) {
          // Build from toState.path, not buildUrl(name): for UNKNOWN_ROUTE
          // buildPath(name) is "" and the typed URL would collapse to the bare
          // prefix. toState.path is already final and, for matched routes,
          // equals buildPath(name, params) — so matched behavior is identical
          // and the 404's typed path is preserved. (#1229)
          const url = this.#urlPrefix + toState.path;

          updateBrowserState(toState, url, replaceHistory, this.#browser);
        }
      },
    };
  }
}
