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

/** One frozen bag for the optional-slot default below, minted once. */
const NO_PARAMS: Params = Object.freeze({});

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

      // Search-aware (RFC-4 M2 / #1548): the query comes from the explicit
      // `search` channel when supplied.
      //
      // ⚑ The RESOLVING pair, the same one `createPluginBuildUrl` takes for the
      // other two URL plugins (#2250). This copy exists for the warn-once above,
      // so the door it asks is pinned separately —
      // `tests/functional/forwarding-build-url-2250.test.ts`.
      //
      // ⚠ **`forwardState`, not `buildNavigationState`** — the chain resolves
      // the same and the URL is identical, but the committing door opts into
      // `reportUndeclaredParamKey`, and a URL built for RENDERING commits
      // nothing: that advice is about a state you are about to persist
      // (#2248 / #1581).
      //
      // ⚠ A name the table does not hold THROWS here rather than answering
      // `undefined`, which is where the old `??` led anyway — `buildPath`
      // throws for one too, and this builder's declared return is `string`.
      //
      // ⚠ **The channel guard travels the other way (#1572)**: a declared query
      // name handed in the PATH bag throws here where `buildPath` answers, so
      // this door refuses what `navigate` refuses. It lives on this seam, so it
      // is unchanged by the swap above.
      // `?? NO_PARAMS` rather than a literal: the slot is optional here while
      // `forwardState` declares it required, and a fresh `{}` per call would
      // mint a throwaway object on every `<Link>` render (#1589).
      const forwarded = api.forwardState(route, params ?? NO_PARAMS, search);
      const path = router.buildPath(
        forwarded.name,
        forwarded.params,
        forwarded.search,
      );

      return this.#urlPrefix + path;
    };

    this.#warnHashIgnored = warnHashIgnored;

    const replaceHistoryStateImpl = createReplaceHistoryState(
      api,
      browser,
      // The prefixing half of `pluginBuildUrl`, without the `buildPath` that
      // would ask the `forwardState` seam a second time (#2087).
      (path) => this.#urlPrefix + path,
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
      // The same prefixing half `createReplaceHistoryState` takes above, and
      // for the same reason: the rollback is handed an already-resolved state
      // and must not rebuild its path from the name (#2250).
      pathToUrl: (path: string) => this.#urlPrefix + path,
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
