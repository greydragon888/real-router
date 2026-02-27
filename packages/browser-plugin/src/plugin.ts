// packages/browser-plugin/modules/plugin.ts

import { getPluginApi } from "@real-router/core";
import { isStateStrict as isState } from "type-guards";

import { createSafeBrowser } from "./browser";
import { defaultOptions, LOGGER_CONTEXT, source } from "./constants";
import {
  escapeRegExp,
  createStateFromEvent,
  shouldSkipTransition,
  handleMissingState,
  updateBrowserState,
  handleTransitionResult,
  validateOptions,
} from "./utils";

import type { BrowserPluginOptions, Browser, HistoryState } from "./types";
import type {
  PluginFactory,
  Router,
  RouterError,
  State,
} from "@real-router/core";

/**
 * Browser plugin factory for real-router.
 * Integrates router with browser history API.
 *
 * Features:
 * - Syncs router state with browser history (pushState/replaceState)
 * - Handles popstate events for browser back/forward navigation
 * - Supports hash-based routing for legacy browsers
 * - Provides URL building and matching utilities
 * - SSR-safe with graceful fallbacks
 * - Runtime validation warns about conflicting options
 *
 * @param opts - Plugin configuration options
 * @param browser - Browser API abstraction (for testing/SSR)
 * @returns Plugin factory function
 *
 * @example
 * ```ts
 * // Hash routing
 * router.usePlugin(browserPluginFactory({ useHash: true, hashPrefix: "!" }));
 *
 * // History routing with hash preservation
 * router.usePlugin(browserPluginFactory({ useHash: false, preserveHash: true }));
 * ```
 */
export function browserPluginFactory(
  opts?: Partial<BrowserPluginOptions>,
  browser: Browser = createSafeBrowser(),
): PluginFactory {
  // Validate user-provided options before merging with defaults
  const hasInvalidTypes = validateOptions(opts, defaultOptions);

  let options = { ...defaultOptions, ...opts } as BrowserPluginOptions;

  // Skip normalization if invalid types detected (prevents runtime errors)
  if (hasInvalidTypes) {
    console.warn(
      `[${LOGGER_CONTEXT}] Using default options due to invalid types`,
    );
    options = { ...defaultOptions } as BrowserPluginOptions;
  }

  // Remove conflicting properties based on mode to prevent misuse
  // This ensures options object is clean even if JS users pass invalid config
  if (options.useHash === true) {
    // Hash mode: remove history-only options
    delete (options as unknown as Record<string, unknown>).preserveHash;
  } else {
    // History mode (default): remove hash-only options
    delete (options as unknown as Record<string, unknown>).hashPrefix;
  }

  // Normalize base path to prevent common configuration errors
  // Type check needed for runtime safety (JS users may pass wrong types)
  if (options.base && typeof options.base === "string") {
    // Ensure leading slash for absolute paths
    if (!options.base.startsWith("/")) {
      options.base = `/${options.base}`;
    }

    // Remove trailing slash to prevent double slashes
    if (options.base.endsWith("/")) {
      options.base = options.base.slice(0, -1);
    }
  }

  // Cache RegExp patterns at plugin creation for performance
  const regExpCache = new Map<string, RegExp>();
  const getCachedRegExp = (pattern: string): RegExp => {
    const cached = regExpCache.get(pattern);

    if (cached !== undefined) {
      return cached;
    }

    const newRegExp = new RegExp(pattern);

    regExpCache.set(pattern, newRegExp);

    return newRegExp;
  };

  // Create transition options with proper typing for exactOptionalPropertyTypes
  // replace: true is needed because popstate means URL already changed (back/forward)
  const forceDeactivate = options.forceDeactivate;
  /* v8 ignore next 4 -- @preserve both branches tested, coverage tool limitation */
  const transitionOptions =
    forceDeactivate === undefined
      ? { source, replace: true }
      : { forceDeactivate, source, replace: true };

  let removePopStateListener: (() => void) | undefined;

  return function browserPlugin(routerBase) {
    // Cast to augmented Router (class + module augmentation: buildUrl, matchUrl, etc.)
    const router = routerBase as Router;
    const api = getPluginApi(routerBase);

    // Store original methods for restoration on teardown

    const routerStart = router.start;

    // Transition state management
    let isTransitioning = false;

    // Deferred popstate event queue (stores only the last event)
    let deferredPopstateEvent: PopStateEvent | null = null;

    // Frozen copy of lastKnownState for immutability
    let cachedFrozenState: State | undefined;

    // Options can be changed at runtime in onStart
    /* v8 ignore next -- @preserve fallback for undefined base */
    const getBase = () => options.base ?? "";
    /* v8 ignore next -- @preserve fallback for undefined hashPrefix */
    const hashPrefix = options.hashPrefix ?? "";
    const escapedHashPrefix = escapeRegExp(hashPrefix);
    const prefix = options.useHash ? `#${hashPrefix}` : "";

    // Pre-compute RegExp patterns
    const hashPrefixRegExp = escapedHashPrefix
      ? getCachedRegExp(`^#${escapedHashPrefix}`)
      : null;

    /**
     * Parses URL and extracts path using native URL API.
     * More robust than regex parsing - handles IPv6, Unicode, edge cases.
     *
     * @param url - URL to parse
     * @returns Path string or null on parse error
     */
    const urlToPath = (url: string): string | null => {
      try {
        // Use URL API for reliable parsing
        const parsedUrl = new URL(url, globalThis.location.origin);
        const pathname = parsedUrl.pathname;
        const hash = parsedUrl.hash;
        const search = parsedUrl.search;
        const base = getBase();

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          console.warn(`[${LOGGER_CONTEXT}] Invalid URL protocol in ${url}`);

          return null;
        }

        if (options.useHash) {
          // Use cached RegExp or simple slice if no prefix
          const path = hashPrefixRegExp
            ? hash.replace(hashPrefixRegExp, "")
            : hash.slice(1);

          return path + search;
        } else if (base) {
          // Remove base prefix
          const escapedBase = escapeRegExp(base);
          const baseRegExp = getCachedRegExp(`^${escapedBase}`);
          const stripped = pathname.replace(baseRegExp, "");

          return (stripped.startsWith("/") ? "" : "/") + stripped + search;
        }

        return pathname + search;
      } catch (error) {
        // Graceful fallback instead of throw
        console.warn(`[${LOGGER_CONTEXT}] Could not parse url ${url}`, error);

        return null;
      }
    };

    /**
     * Overrides router.start to integrate with browser location.
     * When no path is provided, resolves current browser URL automatically.
     */
    router.start = (path?: string) => {
      return routerStart(path ?? browser.getLocation(options));
    };

    /**
     * Builds URL from route name and params.
     * Adds base path and hash prefix according to options.
     *
     * @security
     * When using buildUrl output in templates:
     * - ✅ SAFE: Modern frameworks (React, Vue, Angular) auto-escape in templates
     * - ✅ SAFE: Setting href attribute via DOM API (element.href = url)
     * - ❌ UNSAFE: Using innerHTML or similar without escaping
     *
     * @example
     * // Safe - React auto-escapes
     * <Link to={router.buildUrl('users', params)} />
     *
     * // Safe - Vue auto-escapes
     * <router-link :to="router.buildUrl('users', params)" />
     *
     * // Unsafe - manual HTML construction
     * element.innerHTML = `<a href="${router.buildUrl('users', params)}">Link</a>`; // ❌ DON'T
     */
    router.buildUrl = (route, params) => {
      const path = router.buildPath(route, params);

      return getBase() + prefix + path;
    };

    /**
     * Matches URL and returns corresponding state
     */
    router.matchUrl = (url) => {
      const path = urlToPath(url);

      return path ? api.matchPath(path) : undefined;
    };

    /**
     * Replaces current history state without triggering navigation.
     * Useful for updating URL without causing a full transition.
     */
    router.replaceHistoryState = (name, params = {}) => {
      const state = api.buildState(name, params);

      if (!state) {
        throw new Error(
          `[real-router] Cannot replace state: route "${name}" is not found`,
        );
      }

      const builtState = api.makeState(
        state.name,
        state.params,
        router.buildPath(state.name, state.params),
        {
          params: state.meta,
          options: {},
        },
        1, // forceId
      );
      const url = router.buildUrl(name, params);

      updateBrowserState(builtState, url, true, browser, options);
    };

    /**
     * lastKnownState: Immutable reference to last successful state.
     * Uses caching to avoid creating new objects on every read.
     * Optimized: Single copy + freeze operation instead of double copying.
     */
    Object.defineProperty(router, "lastKnownState", {
      get() {
        // Note: After teardown, this property is deleted from router,
        // so this getter is only called while plugin is active
        return cachedFrozenState;
      },
      set(value?: State) {
        // Create frozen copy in one operation (no double copying)
        cachedFrozenState = value ? Object.freeze({ ...value }) : undefined;
      },
      enumerable: true,
      configurable: true,
    });

    /**
     * Processes a deferred popstate event if one exists.
     * Called after transition completes.
     */
    function processDeferredEvent() {
      if (deferredPopstateEvent) {
        const event = deferredPopstateEvent;

        deferredPopstateEvent = null; // Clear before processing
        console.warn(`[${LOGGER_CONTEXT}] Processing deferred popstate event`);
        void onPopState(event);
      }
    }

    /**
     * Main popstate event handler.
     * Protected against concurrent transitions and handles errors gracefully.
     * Defers events during transitions to prevent browser history desync.
     */
    async function onPopState(evt: PopStateEvent) {
      // Race condition protection: defer event if transition in progress
      if (isTransitioning) {
        console.warn(
          `[${LOGGER_CONTEXT}] Transition in progress, deferring popstate event`,
        );
        // Store only the latest event (skip intermediate states)
        deferredPopstateEvent = evt;

        return;
      }

      // Top-level error recovery
      try {
        const routerState = router.getState();
        const state = createStateFromEvent(evt, api, browser, options);
        const isNewState = !isState(evt.state);

        // Handle missing state
        if (!state && handleMissingState(router, api, transitionOptions)) {
          return;
        }

        // Skip if states are equal
        if (shouldSkipTransition(state, routerState, router)) {
          return;
        }

        // Execute transition with race protection
        // state is guaranteed to be defined here because:
        // 1. handleMissingState handles !state case (line 339)
        // 2. shouldSkipTransition returns true when !state (utils.ts:129)
        /* v8 ignore start: defensive guard - state guaranteed defined by control flow above */
        if (!state) {
          return;
        }
        /* v8 ignore stop */

        isTransitioning = true;

        try {
          // transitionOptions includes replace: true, which is passed to TRANSITION_SUCCESS
          const toState = await api.navigateToState(
            state,
            routerState,
            transitionOptions,
          );

          handleTransitionResult(
            undefined,
            toState,
            routerState,
            isNewState,
            router,
            browser,
            options,
          );
        } catch (error) {
          handleTransitionResult(
            error as RouterError,
            undefined,
            routerState,
            isNewState,
            router,
            browser,
            options,
          );
        } finally {
          isTransitioning = false;
          // Process any deferred popstate events after transition completes
          processDeferredEvent();
        }
      } catch (error) {
        isTransitioning = false;
        console.error(
          `[${LOGGER_CONTEXT}] Critical error in onPopState`,
          error,
        );

        // Attempt recovery: sync browser with router state
        try {
          const currentState = router.getState();

          if (currentState) {
            const url = router.buildUrl(currentState.name, currentState.params);

            browser.replaceState(currentState as HistoryState, "", url);
          }
        } catch (recoveryError) {
          // If recovery fails, there's nothing more we can do
          console.error(
            `[${LOGGER_CONTEXT}] Failed to recover from critical error`,
            recoveryError,
          );
        }

        // Process any deferred events even after error
        processDeferredEvent();
      }
    }

    return {
      /**
       * Called when router.start() is invoked.
       * Sets up browser history integration.
       */
      onStart: () => {
        if (removePopStateListener) {
          removePopStateListener();
        }

        removePopStateListener = browser.addPopstateListener(
          (evt: PopStateEvent) => void onPopState(evt),
          options,
        );
      },

      /**
       * Called when router.stop() is invoked.
       * Cleans up event listeners.
       */
      onStop: () => {
        if (removePopStateListener) {
          removePopStateListener();
          removePopStateListener = undefined;
        }
      },

      /**
       * Called after successful navigation.
       * Updates browser history with new state.
       */
      onTransitionSuccess: (toState, fromState, navOptions) => {
        router.lastKnownState = toState;

        // Determine if we should replace or push history entry
        const replaceHistory =
          (navOptions.replace ?? !fromState) ||
          (!!navOptions.reload &&
            router.areStatesEqual(toState, fromState, false));

        // Build URL with base and hash prefix
        const url = router.buildUrl(toState.name, toState.params);

        // Preserve hash fragment if configured
        // Note: preserveHash is deleted in hash mode, so it's always undefined there
        const shouldPreserveHash =
          options.preserveHash &&
          (!fromState || fromState.path === toState.path);

        const finalUrl = shouldPreserveHash ? url + browser.getHash() : url;

        // Update browser history
        updateBrowserState(toState, finalUrl, replaceHistory, browser, options);
      },

      /**
       * Called when plugin is unsubscribed.
       * Restores original router state for clean teardown.
       */
      teardown: () => {
        // Remove event listeners
        if (removePopStateListener) {
          removePopStateListener();
          removePopStateListener = undefined;
        }

        // Restore original router methods
        router.start = routerStart;

        // Clean up added properties
        delete (router as Partial<Router>).buildUrl;
        delete (router as Partial<Router>).matchUrl;
        delete (router as Partial<Router>).replaceHistoryState;
        delete (router as Partial<Router>).lastKnownState;
      },
    };
  };
}
