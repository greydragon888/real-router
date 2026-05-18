import { UNKNOWN_ROUTE } from "@real-router/core";

import {
  shouldReplaceHistory,
  buildUrl,
  urlToPath,
  createPluginBuildUrl,
  createStartInterceptor,
  createReplaceHistoryState,
  encodeHashFragment,
  getDecodedHash,
  normalizeHashInput,
} from "./browser-env";
import {
  peekBack,
  peekForward,
  hasVisited,
  getVisitedRoutes,
  getRouteVisitCount,
  findLastEntryForRoute,
  resolveEntryToMatchedState,
  canGoBack,
  canGoForward,
  canGoBackTo,
} from "./history-extensions";
import { createNavigateHandler } from "./navigate-handler";
import { wrapNavigationBrowserWithSyncing } from "./navigation-browser";

import type { UrlContext } from "./browser-env";
import type { SyncingFlag } from "./navigation-browser";
import type {
  NavigationBrowser,
  NavigationMeta,
  NavigationPluginOptions,
  NavigationSharedState,
} from "./types";
import type {
  NavigationOptions,
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
  readonly #urlClaim: {
    write: (state: State, value: UrlContext) => void;
    release: () => void;
  };
  readonly #lifecycle: Pick<Plugin, "onStart" | "onStop" | "teardown">;
  readonly #syncing: SyncingFlag = { current: false };

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
    // Wrap mutations with the syncing flag so the navigate handler can
    // short-circuit re-entrant events fired by the plugin's own writes
    // (`nav.navigate` and `nav.navigate({history:"replace"})` fire navigate
    // events synchronously). The flag is per-instance — never shared across
    // plugins — so multiple routers running concurrent transitions don't
    // bleed syncing state into each other.
    this.#browser = wrapNavigationBrowserWithSyncing(browser, this.#syncing);

    this.#claim = api.claimContextNamespace("navigation");
    this.#urlClaim = api.claimContextNamespace("url");
    this.#removeStartInterceptor = createStartInterceptor(api, this.#browser);

    // Cross-document load priming (#531). On F5, browser back/forward across
    // a page boundary, or a fresh URL bar entry, the prior JS context is
    // discarded — the navigate event handler never sees the activation.
    // Without this, deriveNavigationType in onTransitionSuccess falls through
    // to "replace" for every initial transition, breaking scroll restore on
    // reload (#497) and any consumer branching on navigationType.
    // navigation.activation reflects the cross-document navigation that
    // activated this document; it stays constant across same-document
    // navigations, so this only affects the FIRST transition.
    const activationType = this.#browser.getActivationType();

    if (activationType) {
      this.#capturedMeta = {
        navigationType: activationType,
        userInitiated: false,
        direction: activationType === "push" ? "forward" : "unknown",
        sourceElement: null,
      };
    }

    // Hash for the first transition (#532) is read lazily inside
    // onTransitionSuccess via `getDecodedHash(browser)` — capturing in the
    // constructor is too eager (in tests, the mock URL is set after the
    // plugin is constructed). The lazy read still covers F5 / fresh URL
    // bar entry: by the time onTransitionSuccess fires the browser already
    // reflects the destination URL.

    const pluginBuildUrl = createPluginBuildUrl(router, options.base);

    this.#removeExtensions = api.extendRouter({
      buildUrl: pluginBuildUrl,
      matchUrl: (url: string) =>
        api.matchPath(urlToPath(url, options.base)) ?? undefined,
      replaceHistoryState: createReplaceHistoryState(
        api,
        router,
        this.#browser,
        pluginBuildUrl,
      ),

      peekBack: () => peekBack(this.#browser, api, options.base),
      peekForward: () => peekForward(this.#browser, api, options.base),
      hasVisited: (routeName: string) =>
        hasVisited(this.#browser, api, options.base, routeName),
      getVisitedRoutes: () =>
        getVisitedRoutes(this.#browser, api, options.base),
      getRouteVisitCount: (routeName: string) =>
        getRouteVisitCount(this.#browser, api, options.base, routeName),
      traverseToLast: (routeName: string) => this.traverseToLast(routeName),
      canGoBack: () => canGoBack(this.#browser),
      canGoForward: () => canGoForward(this.#browser),
      canGoBackTo: (routeName: string) =>
        canGoBackTo(this.#browser, api, options.base, routeName),
    });

    const handler = createNavigateHandler({
      router,
      api,
      browser: this.#browser,
      isSyncingFromRouter: () => this.#syncing.current,
      setCapturedMeta: (meta) => {
        this.#capturedMeta = meta;
      },
      base: options.base,
      transitionOptions,
    });

    this.#lifecycle = createNavigateLifecycle({
      browser: this.#browser,
      shared,
      handler,
      removeStartInterceptor: this.#removeStartInterceptor,
      removeExtensions: this.#removeExtensions,
      releaseClaim: () => {
        this.#claim.release();
        this.#urlClaim.release();
      },
    });
  }

  async traverseToLast(routeName: string): Promise<State> {
    const entries = this.#browser.entries();
    const currentKey = this.#browser.currentEntry?.key;
    const candidate = findLastEntryForRoute(
      entries,
      routeName,
      this.#api,
      this.#options.base,
      currentKey,
    );

    // resolveEntryToMatchedState throws for missing entry, null url, or
    // unmatched url — same three error branches the old inline checks
    // produced. Extracted so the error paths can be unit-tested directly
    // without namespace-level vi.spyOn gymnastics.
    const { entry, matchedState } = resolveEntryToMatchedState(
      candidate,
      routeName,
      this.#api,
      this.#options.base,
    );

    const currentEntry = this.#browser.currentEntry;

    if (!currentEntry) {
      // Invariant violation: traverseToLast is only callable after
      // router.start(), which guarantees a current entry. A null here means
      // the plugin was stopped mid-call or the browser abstraction is
      // broken — either way, silently picking direction "forward" from a
      // fallback `-1` would mask the bug. Fail loudly instead.
      throw new Error(
        `[navigation-plugin] Cannot determine direction for traverseToLast("${routeName}"): browser.currentEntry is null. The plugin must be started before calling traverseToLast.`,
      );
    }

    this.#capturedMeta = {
      navigationType: "traverse",
      userInitiated: false,
      direction: entry.index > currentEntry.index ? "forward" : "back",
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

        const frozenMeta = Object.freeze(this.#capturedMeta);

        this.#claim.write(toState, frozenMeta);
        this.#capturedMeta = undefined;

        // Consume pendingTraverseKey BEFORE calling browser.traverseTo.
        // If traverseTo throws (Navigation API can reject on evicted keys
        // under memory pressure), we must not leave the stale key behind —
        // otherwise the NEXT transition's onTransitionSuccess would see it
        // and replay the traverse against the same already-broken key.
        // The syncing flag is raised/lowered inside NavigationBrowser around
        // each mutation, so we do not need to manage it here.
        const traverseKey = this.#pendingTraverseKey;

        this.#pendingTraverseKey = undefined;

        if (traverseKey) {
          this.#browser.traverseTo(traverseKey);
        } else {
          // Tri-state hash resolution (#532).
          //   navOptions.hash === undefined → preserve current browser hash
          //   navOptions.hash === ""        → explicitly clear
          //   navOptions.hash === "value"   → explicitly set
          //
          // The "preserve" branch reads location.hash from the browser, not
          // fromState.context.url.hash — this captures dynamic fragment
          // changes the user makes outside the plugin (anchor clicks,
          // manual location.hash assignment) instead of replaying the
          // last-published value.
          //
          // hashChanged compares the chosen hash against the *published*
          // previous hash (fromState.context.url.hash), so subscribers see
          // a true signal regardless of whether the value came from
          // navOptions or the browser.
          const browserHash = getDecodedHash(this.#browser);
          const publishedPrevHash =
            (fromState?.context as { url?: { hash?: string } } | undefined)?.url
              ?.hash ?? "";

          const hash =
            navOptions.hash === undefined
              ? browserHash
              : normalizeHashInput(navOptions.hash);

          this.#urlClaim.write(
            toState,
            Object.freeze({
              hash,
              hashChanged: navOptions.hashChange ?? hash !== publishedPrevHash,
            }),
          );

          const url = buildUrl(toState.path, this.#options.base);
          const finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url;
          const historyState = {
            name: toState.name,
            params: toState.params,
            path: toState.path,
          };

          if (toState.name === UNKNOWN_ROUTE) {
            this.#browser.updateCurrentEntry({ state: historyState });
          } else {
            // Initial transition (no fromState) means router.start() is
            // resolving the cross-document load — the browser already created
            // a history entry for it. A `push` here would duplicate that
            // entry. Always `replace` on the first transition so the
            // back/forward stack has only one entry (canGoBack === false).
            // navigationType metadata stays "push"/"reload"/"replace" for
            // downstream consumers (scroll restore, direction tracker).
            const isInitialTransition = fromState === undefined;
            const replace =
              frozenMeta.navigationType !== "push" || isInitialTransition;

            this.#browser.navigate(finalUrl, {
              state: historyState,
              history: replace ? "replace" : "push",
            });
          }
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
