import { getPluginApi } from "@real-router/core/api";

import {
  buildUrl,
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

  const shared: SharedFactoryState = { removePopStateListener: undefined };

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

  const pluginBuildUrl = createPluginBuildUrl(router, options.base);

  const removeExtensions = api.extendRouter({
    buildUrl: pluginBuildUrl,
    matchUrl: (url: string) =>
      api.matchPath(urlToPath(url, options.base)) ?? undefined,
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

  return {
    ...lifecycle,

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
      //   navOptions.hash === undefined → preserve current browser hash
      //   navOptions.hash === ""        → explicitly clear
      //   navOptions.hash === "value"   → explicitly set
      //
      // The "preserve" branch reads location.hash from the browser, not
      // fromState.context.url.hash — captures dynamic fragment changes
      // (anchor clicks, manual location.hash assignment) made outside the
      // plugin. hashChanged compares the chosen hash against the published
      // previous hash so subscribers see a true signal.
      const browserHash = getDecodedHash(browser);
      const publishedPrevHash =
        (fromState?.context as { url?: { hash?: string } } | undefined)?.url
          ?.hash ?? "";

      const hash =
        navOptions.hash === undefined
          ? browserHash
          : normalizeHashInput(navOptions.hash);

      urlClaim.write(
        toState,
        Object.freeze({
          hash,
          hashChanged: navOptions.hashChange ?? hash !== publishedPrevHash,
        }),
      );

      const url = buildUrl(toState.path, options.base);
      const finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url;

      updateState(toState, finalUrl, replaceHistory, browser);

      const isPopstate = navOptions.source === POPSTATE_SOURCE;

      claim.write(toState, isPopstate ? FROZEN_POPSTATE : FROZEN_NAVIGATE);
    },
  };
}
