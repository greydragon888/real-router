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
  safeParseUrl,
  decodeHashFragment,
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
import { isSameHref } from "./href-utils";
import { createNavigateHandler } from "./navigate-handler";

import type { UrlContext } from "./browser-env";
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

  #capturedMeta: NavigationMeta | undefined;
  #pendingTraverseKey: string | undefined;
  // Always set together with #pendingTraverseKey; `""` means "destination has
  // no fragment". Typed as `string` (not `string | undefined`) so the traverse
  // branch reads it without a redundant `?? ""` fallback that coverage cannot
  // exercise.
  #pendingTraverseHash = "";
  // Reusable buffer for the {name, params, path} payload passed to
  // browser.navigate / browser.updateCurrentEntry. The Navigation API
  // structured-clones state synchronously inside the call, so this object
  // never escapes — same trick createReplaceHistoryState uses.
  readonly #historyStateBuffer: {
    name: string;
    params: object;
    search: object;
    path: string;
  } = {
    name: "",
    params: {},
    search: {},
    path: "",
  };

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
    // The navigate handler short-circuits re-entrant events from plugin-
    // initiated writes by checking `event.info === PLUGIN_SYNC_INFO`. The
    // built-in `createNavigationBrowser` tags every mutation with that
    // sentinel; consumer-supplied browsers must do the same — see CLAUDE.md
    // "Router-driven mutations re-enter the navigate handler".
    this.#browser = browser;

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
    const { entry, entryUrl, matchedState } = resolveEntryToMatchedState(
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
    // Capture the destination entry's hash so onTransitionSuccess can populate
    // state.context.url for the traverse branch — mirrors what navigate-handler
    // does via navOptions.hash for browser-initiated navigation.
    this.#pendingTraverseHash = extractHashFromEntryUrl(entryUrl);

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
        const traverseKey = this.#pendingTraverseKey;
        const traverseHash = this.#pendingTraverseHash;

        this.#pendingTraverseKey = undefined;
        this.#pendingTraverseHash = "";

        const publishedPrevHash = readPublishedHash(fromState);

        if (traverseKey) {
          // Mirror the urlClaim.write the `else` branch does for non-traverse
          // navigations — without this, `router.traverseToLast(name)` leaves
          // state.context.url undefined for subscribers (#urlClaim was set in
          // navigate-handler for browser-driven traverse, but programmatic
          // traverseToLast bypasses that path).
          this.#urlClaim.write(
            toState,
            Object.freeze({
              hash: traverseHash,
              hashChanged: traverseHash !== publishedPrevHash,
            }),
          );
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

          this.#historyStateBuffer.name = toState.name;
          this.#historyStateBuffer.params = toState.params;
          this.#historyStateBuffer.search = toState.search;
          this.#historyStateBuffer.path = toState.path;

          // Two cases route through `updateCurrentEntry` (state-only mutation
          // of the current history entry, no navigate event):
          //
          // 1. UNKNOWN_ROUTE — URL stays as the browser had it; we only need
          //    to tag the entry's state with the router's `name/params/path`.
          // 2. Same-URL transition (#580) — the target URL is what the
          //    browser already shows, so a `nav.navigate(url,
          //    {history:"replace"})` would either be a no-op (Chromium fires
          //    a navigate event we short-circuit via `event.info ===
          //    PLUGIN_SYNC_INFO`) or — on Safari 26.2 WKWebView under custom
          //    protocols (`tauri://`, `app://`) — a *cross-document*
          //    navigation that discards the JS context. The bootstrap then
          //    re-runs the plugin which re-issues the same call, and the
          //    cycle becomes a render loop the user perceives as flicker.
          //    `updateCurrentEntry` is the spec-correct primitive for a
          //    state-only mutation and avoids both behaviours.
          if (
            toState.name === UNKNOWN_ROUTE ||
            isSameHref(finalUrl, this.#browser.currentEntry?.url)
          ) {
            this.#browser.updateCurrentEntry({
              state: this.#historyStateBuffer,
            });
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
              state: this.#historyStateBuffer,
              history: replace ? "replace" : "push",
            });
          }
        }
      },

      onTransitionCancel: () => {
        this.#capturedMeta = undefined;
        this.#pendingTraverseKey = undefined;
        this.#pendingTraverseHash = "";
      },

      onTransitionError: () => {
        this.#capturedMeta = undefined;
        this.#pendingTraverseKey = undefined;
        this.#pendingTraverseHash = "";
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

/**
 * Reads the previously published hash from `fromState.context.url`.
 * Returns `""` for the initial transition (no `fromState`), for states whose
 * `context.url` namespace was not claimed yet, or for the documented `{ hash:
 * "" }` cleared form. Extracted from `onTransitionSuccess` to share between
 * the traverse and non-traverse branches.
 */
function readPublishedHash(fromState: State | undefined): string {
  return (
    (fromState?.context as { url?: { hash?: string } } | undefined)?.url
      ?.hash ?? ""
  );
}

/**
 * Decodes the URL fragment from a NavigationHistoryEntry's url string.
 * Returns `""` when no fragment is present. The caller (NavigationPlugin's
 * `traverseToLast`) only reaches here AFTER `resolveEntryToMatchedState`,
 * which has already rejected `entry.url === null`, so the input is guaranteed
 * non-null at runtime.
 */
function extractHashFromEntryUrl(entryUrl: string): string {
  const rawHash = safeParseUrl(entryUrl).hash;

  return rawHash ? decodeHashFragment(rawHash.slice(1)) : "";
}

function createNavigateLifecycle(deps: NavigateLifecycleDeps): Plugin {
  // Captured at onStart so onStop/teardown clear the shared slot ONLY while we
  // still own it — a later router's onStart replaces it (last-wins, #758);
  // clearing it unconditionally on the earlier router's stop/dispose
  // disconnects the LIVE router (#1213).
  let myRemover: (() => void) | undefined;

  return {
    onStart() {
      deps.shared.removeNavigateListener?.();
      myRemover = deps.browser.addNavigateListener(deps.handler);
      deps.shared.removeNavigateListener = myRemover;
    },

    onStop() {
      if (myRemover && deps.shared.removeNavigateListener === myRemover) {
        deps.shared.removeNavigateListener();
        deps.shared.removeNavigateListener = undefined;
      }

      myRemover = undefined;
    },

    teardown() {
      if (myRemover && deps.shared.removeNavigateListener === myRemover) {
        deps.shared.removeNavigateListener();
        deps.shared.removeNavigateListener = undefined;
      }

      myRemover = undefined;
      deps.removeStartInterceptor();
      deps.removeExtensions();
      deps.releaseClaim();
    },
  };
}
