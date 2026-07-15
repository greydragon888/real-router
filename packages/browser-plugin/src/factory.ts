import { getPluginApi } from "@real-router/core/api";

import {
  buildUrl,
  canSkipPopstateHistoryWrite,
  createPluginBuildUrl,
  createPopstateHandler,
  createPopstateLifecycle,
  createReplaceHistoryState,
  createSafeBrowser,
  createStartInterceptor,
  createUpdateBrowserState,
  encodeHashFragment,
  extractPath,
  getDecodedHash,
  normalizeBase,
  normalizeHashInput,
  safelyEncodePath,
  shouldReplaceHistory,
  urlToPath,
} from "./browser-env";
import { defaultOptions, LOGGER_CONTEXT, POPSTATE_SOURCE } from "./constants";
import { validateOptions } from "./validation";

import type {
  Browser,
  PopstateTransitionOptions,
  SharedFactoryState,
  UrlContext,
} from "./browser-env";
import type { BrowserContext, BrowserPluginOptions } from "./types";
import type {
  NavigationOptions,
  Plugin,
  PluginFactory,
  Router,
  State,
} from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

const FROZEN_POPSTATE: BrowserContext = Object.freeze({
  source: "popstate",
  direction: "back",
});
const FROZEN_NAVIGATE: BrowserContext = Object.freeze({
  source: "navigate",
  direction: "forward",
});

export function browserPluginFactory(
  opts?: Partial<BrowserPluginOptions>,
  browser?: Browser,
): PluginFactory {
  validateOptions(opts);

  const options: Required<BrowserPluginOptions> = {
    ...defaultOptions,
    ...opts,
  };

  options.base = normalizeBase(options.base);

  const resolvedBrowser = browser ?? createDefaultBrowser(options.base);

  const transitionOptions = {
    forceDeactivate: options.forceDeactivate,
    source: POPSTATE_SOURCE,
    replace: true as const,
  };

  const shared: SharedFactoryState = {
    removePopStateListener: undefined,
    removeHashChangeListener: undefined,
  };

  return function browserPlugin(routerBase) {
    return createBrowserPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    );
  };
}

/**
 * Creates the default `Browser` for the plugin, with a memoized `getLocation`
 * that skips re-running `extractPath`/`safelyEncodePath` when neither
 * `pathname` nor `search` has changed since the last call (#8.2 A7).
 *
 * Initial sentinel is `"\0"` — a NUL byte cannot appear in a real
 * `location.pathname`, so the first call is always a miss without needing a
 * separate "primed" flag.
 */
function createDefaultBrowser(base: string): Browser {
  let cachedPathname = "\0";
  let cachedSearch = "";
  let cachedResult = "";

  return createSafeBrowser(() => {
    const { pathname, search } = globalThis.location;

    if (pathname === cachedPathname && search === cachedSearch) {
      return cachedResult;
    }

    cachedPathname = pathname;
    cachedSearch = search;
    cachedResult = safelyEncodePath(extractPath(pathname, base)) + search;

    return cachedResult;
  }, "browser-plugin");
}

function createBrowserPlugin(
  router: Router,
  api: PluginApi,
  options: Required<BrowserPluginOptions>,
  browser: Browser,
  transitionOptions: PopstateTransitionOptions,
  shared: SharedFactoryState,
): Plugin {
  const claim = api.claimContextNamespace("browser");
  // Shared URL namespace (#532) — both navigation-plugin and browser-plugin
  // claim "url"; mutually exclusive at runtime.
  const urlClaim = api.claimContextNamespace("url") as {
    write: (state: State, value: UrlContext) => void;
    release: () => void;
  };
  const updateState = createUpdateBrowserState();
  const removeStartInterceptor = createStartInterceptor(api, browser);

  // Cache the current URL fragment instead of reading location.hash on every
  // navigation (#532). A per-nav `location.*` read forces the browser to commit
  // the pending pushState synchronously (~0.04 ms/nav). The cache stays fresh via
  // (a) the plugin's own navigations (set in onTransitionSuccess) and (b) a
  // hashchange listener for *external* fragment changes (anchor clicks,
  // `location.hash = …`) — exactly what the per-nav read used to detect.
  let currentHash = "";
  const syncHashFromBrowser = (): void => {
    currentHash = getDecodedHash(browser);
  };

  const pluginBuildUrl = createPluginBuildUrl(router, options.base);

  const replaceHistoryStateImpl = createReplaceHistoryState(
    api,
    router,
    browser,
    pluginBuildUrl,
  );

  const removeExtensions = api.extendRouter({
    buildUrl: pluginBuildUrl,
    matchUrl: (url: string) =>
      api.matchPath(urlToPath(url, options.base)) ?? undefined,
    replaceHistoryState: (
      ...args: Parameters<typeof replaceHistoryStateImpl>
    ) => {
      replaceHistoryStateImpl(...args);
      // #1212: replaceState fires NO hashchange, so the currentHash cache would
      // stay stale until the next own nav-write — a later preserve-navigate then
      // wipes the fragment. Re-sync here; this is a COLD path, so the live read
      // is free (the #1019 cost only bites the hot navigation stream, which
      // still reads the cache — see the "does not read location.hash on the
      // per-navigation hot path" test).
      syncHashFromBrowser();
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
    // Hash bridging (#532). popstate doesn't carry a URL — we sample
    // location.hash after the browser has updated to the destination.
    getCurrentHash: () => getDecodedHash(browser),
    getCurrentContextHash: () =>
      (router.getState()?.context as { url?: { hash?: string } } | undefined)
        ?.url?.hash ?? "",
  });

  const lifecycle = createPopstateLifecycle({
    browser,
    shared,
    handler,
    cleanup: () => {
      removeStartInterceptor();
      removeExtensions();
      claim.release();
      urlClaim.release();
    },
  });

  // Captured at onStart so onStop/teardown clear the shared hashchange slot ONLY
  // while we still own it — a later router's onStart replaces it (last-wins,
  // #758); clearing it unconditionally on the earlier router's stop/dispose
  // disconnects the LIVE router (#1213). Mirrors the popstate lifecycle guard.
  let myHashRemover: (() => void) | undefined;

  return {
    onStart: () => {
      lifecycle.onStart?.();
      // Read location.hash once per (re)start — not per navigation — so the
      // cache is fresh after stop/re-start, then track external changes.
      syncHashFromBrowser();
      shared.removeHashChangeListener?.();
      myHashRemover = browser.addHashChangeListener(syncHashFromBrowser);
      shared.removeHashChangeListener = myHashRemover;
    },

    onStop: () => {
      lifecycle.onStop?.();

      if (myHashRemover && shared.removeHashChangeListener === myHashRemover) {
        shared.removeHashChangeListener();
        shared.removeHashChangeListener = undefined;
      }

      myHashRemover = undefined;
    },

    teardown: () => {
      if (myHashRemover && shared.removeHashChangeListener === myHashRemover) {
        shared.removeHashChangeListener();
        shared.removeHashChangeListener = undefined;
      }

      myHashRemover = undefined;
      lifecycle.teardown?.();
    },

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

      // Tri-state hash resolution (#532).
      //   navOptions.hash === undefined → preserve current fragment
      //   navOptions.hash === ""        → explicitly clear
      //   navOptions.hash === "value"   → explicitly set
      //
      // The "preserve" branch uses the cached `currentHash` (kept fresh by the
      // hashchange listener) instead of reading location.hash here — a per-nav
      // location.* read forces a synchronous pushState commit. The cache still
      // captures external fragment changes (anchor clicks, manual location.hash)
      // via hashchange. hashChanged compares the chosen hash against the
      // published previous hash so subscribers see a true signal.
      const browserHash = currentHash;
      const publishedPrevHash =
        (fromState?.context as { url?: { hash?: string } } | undefined)?.url
          ?.hash ?? "";

      const hash =
        navOptions.hash === undefined
          ? browserHash
          : normalizeHashInput(navOptions.hash);

      // Keep the cache in sync with the fragment we are about to commit —
      // pushState/replaceState do not fire hashchange, so the listener never
      // observes the plugin's own navigations.
      currentHash = hash;

      urlClaim.write(
        toState,
        Object.freeze({
          hash,
          hashChanged: navOptions.hashChange ?? hash !== publishedPrevHash,
        }),
      );

      const url = buildUrl(toState.path, options.base);
      const finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url;

      const isPopstate = navOptions.source === POPSTATE_SOURCE;

      // On back/forward the browser has already restored the target entry's
      // {name,params,path} + URL, so the plugin's replaceState re-writes the
      // same values — a value-level no-op that still fires a second
      // updateForSameDocumentNavigation Blink event. Skip it when provably a
      // no-op; every load-bearing case (redirect, normalization, corrupted
      // history.state) keeps the write. (#1353)
      const skipHistoryWrite =
        isPopstate &&
        replaceHistory &&
        canSkipPopstateHistoryWrite(toState, browser, router.areStatesEqual);

      if (!skipHistoryWrite) {
        updateState(toState, finalUrl, replaceHistory, browser);
      }

      claim.write(toState, isPopstate ? FROZEN_POPSTATE : FROZEN_NAVIGATE);
    },
  };
}
