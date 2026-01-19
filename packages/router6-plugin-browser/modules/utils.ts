// packages/router6-plugin-browser/modules/utils.ts

import { errorCodes, events } from "router6";
import { isStateStrict as isState } from "type-guards";

import { type DefaultBrowserPluginOptions, LOGGER_CONTEXT } from "./constants";

import type {
  BrowserPluginOptions,
  HistoryState,
  StartRouterArguments,
  Browser,
} from "./types";
import type {
  Router,
  State,
  DoneFn,
  NavigationOptions,
  RouterError,
} from "router6";

/**
 * No-op function for default callbacks
 */
export const noop = (): void => undefined;

/**
 * Cache for escaped RegExp strings
 */
const escapeRegExpCache = new Map<string, string>();

/**
 * Escapes special RegExp characters in a string.
 * Used to safely build RegExp from user-provided strings (hashPrefix, base).
 *
 * @param str - String to escape
 * @returns Escaped string safe for RegExp construction
 */
export const escapeRegExp = (str: string): string => {
  const cached = escapeRegExpCache.get(str);

  if (cached !== undefined) {
    return cached;
  }

  const escaped = str.replaceAll(/[$()*+.?[\\\]^{|}-]/g, String.raw`\$&`);

  escapeRegExpCache.set(str, escaped);

  return escaped;
};

/**
 * Extracts start router arguments from various overloads
 *
 * @param args - Arguments passed to router.start()
 * @param browser - Browser API instance
 * @param options - Browser plugin options
 * @returns Tuple of [startPathOrState, done callback]
 */
export function getStartRouterArguments(
  args: StartRouterArguments,
  browser: Browser,
  options: BrowserPluginOptions,
): [startPathOrState: string | State | undefined, done: DoneFn] {
  if (args.length === 0) {
    const location = browser.getLocation(options);

    if (location === "/") {
      return [undefined, noop];
    }

    return [location, noop];
  }

  if (args.length === 1) {
    if (typeof args[0] === "function") {
      return [browser.getLocation(options), args[0]];
    }

    return [args[0], noop];
  }

  // args.length === 2
  const [pathOrState, done] = args as [string | State, DoneFn];

  return [pathOrState, done];
}

/**
 * Creates state from popstate event
 *
 * @param evt - PopStateEvent from browser
 * @param router - Router instance
 * @param browser - Browser API instance
 * @param options - Browser plugin options
 * @param source - Event source identifier
 * @returns Router state or undefined
 */
export function createStateFromEvent(
  evt: PopStateEvent,
  router: Router,
  browser: Browser,
  options: BrowserPluginOptions,
  source: string,
): State | undefined {
  const isNewState = !isState(evt.state);

  if (isNewState) {
    return router.matchPath(browser.getLocation(options), source);
  }

  return router.makeState(
    evt.state.name,
    evt.state.params,
    evt.state.path,
    {
      ...evt.state.meta,
      params: evt.state.meta?.params ?? {},
      options: evt.state.meta?.options ?? {},
      redirected: !!evt.state.meta?.redirected,
      source,
    },
    evt.state.meta?.id,
  );
}

/**
 * Checks if transition should be skipped (same states)
 *
 * @param newState - New state from event
 * @param currentState - Current router state
 * @param router - Router instance
 * @returns true if transition should be skipped
 */
export function shouldSkipTransition(
  newState: State | undefined,
  currentState: State | undefined,
  router: Router,
): boolean {
  if (!newState) {
    return true;
  }

  return !!(
    currentState && router.areStatesEqual(newState, currentState, false)
  );
}

/**
 * Handles missing state by navigating to default route
 *
 * @param router - Router instance
 * @param transitionOptions - Options for transition
 * @returns true if handled, false if no default route
 */
export function handleMissingState(
  router: Router,
  transitionOptions: NavigationOptions,
): boolean {
  const routerOptions = router.getOptions();
  const { defaultRoute } = routerOptions;

  if (!defaultRoute) {
    return false;
  }

  router.navigateToDefault({
    ...transitionOptions,
    reload: true,
    replace: true,
  });

  return true;
}

/**
 * Updates browser state (pushState or replaceState)
 *
 * @param state - Router state
 * @param url - URL to set
 * @param replace - Whether to replace instead of push
 * @param browser - Browser API instance
 * @param options - Browser plugin options
 */
export function updateBrowserState(
  state: State,
  url: string,
  replace: boolean,
  browser: Browser,
  options: BrowserPluginOptions,
): void {
  const trimmedState: HistoryState = {
    meta: state.meta,
    name: state.name,
    params: state.params,
    path: state.path,
  };

  const finalState: HistoryState =
    options.mergeState && browser.getState()
      ? { ...browser.getState(), ...trimmedState }
      : trimmedState;

  if (replace) {
    browser.replaceState(finalState, "", url);
  } else {
    browser.pushState(finalState, "", url);
  }
}

/**
 * Handles transition result (success, redirect, or error)
 *
 * @param err - Router error or undefined if successful
 * @param toState - Target state
 * @param fromState - Source state
 * @param isNewState - Whether this is a new state (not from history)
 * @param router - Router instance
 * @param browser - Browser API instance
 * @param options - Browser plugin options
 */
export function handleTransitionResult(
  err: RouterError | undefined,
  toState: State | undefined,
  fromState: State | undefined,
  isNewState: boolean,
  router: Router,
  browser: Browser,
  options: BrowserPluginOptions,
): void {
  // Successful transition
  if (!err) {
    router.invokeEventListeners(events.TRANSITION_SUCCESS, toState, fromState, {
      replace: true,
    });

    return;
  }

  // Handle CANNOT_DEACTIVATE
  if (
    err.code === errorCodes.CANNOT_DEACTIVATE &&
    toState &&
    fromState &&
    !isNewState
  ) {
    const url = router.buildUrl(fromState.name, fromState.params);

    updateBrowserState(fromState, url, true, browser, options);
  }
}

/**
 * Type guard to check if a key exists in default options
 */
function isDefaultOptionKey(
  key: string,
  defaults: DefaultBrowserPluginOptions,
): key is keyof DefaultBrowserPluginOptions {
  return key in defaults;
}

/**
 * Validates that an option value has the correct type
 */
function validateOptionType(
  key: keyof DefaultBrowserPluginOptions,
  value: unknown,
  expectedType: string,
): boolean {
  const actualType = typeof value;

  if (actualType !== expectedType && value !== undefined) {
    console.warn(
      `[${LOGGER_CONTEXT}] Invalid type for '${key}': expected ${expectedType}, got ${actualType}`,
    );

    return false;
  }

  return true;
}

/**
 * Validates browser plugin options and warns about conflicting configurations.
 * TypeScript types prevent conflicts at compile-time, but runtime validation
 * is needed for JavaScript users and dynamic configurations.
 *
 * IMPORTANT: This validates only user-provided options, not merged defaults.
 *
 * @returns true if invalid types detected, false otherwise
 */
export function validateOptions(
  opts: Partial<BrowserPluginOptions> | undefined,
  defaultOptions: DefaultBrowserPluginOptions,
): boolean {
  if (!opts) {
    return false;
  }

  let hasInvalidTypes = false;

  // Validate option types against defaults
  // Using Object.keys ensures we only check properties that actually exist
  for (const key of Object.keys(opts)) {
    if (isDefaultOptionKey(key, defaultOptions)) {
      const expectedType = typeof defaultOptions[key];
      const value = opts[key];
      const isValid = validateOptionType(key, value, expectedType);

      if (!isValid) {
        hasInvalidTypes = true;
      }
    }
  }

  // Check for hash mode conflicts
  // Runtime validation for JS users - TypeScript prevents this at compile time

  if (opts.useHash === true && "preserveHash" in opts) {
    console.warn(`[${LOGGER_CONTEXT}] preserveHash ignored in hash mode`);
  }

  // Check for history mode conflicts
  // Runtime validation for JS users - TypeScript prevents this at compile time

  if (opts.useHash === false && "hashPrefix" in opts) {
    // Single type assertion needed: TypeScript narrows opts to HistoryModeOptions
    // where hashPrefix is 'never', but we need to check it at runtime for JS users
    const optsRecord = opts as unknown as Record<string, unknown>;
    const hashPrefix = optsRecord.hashPrefix;

    if (hashPrefix !== undefined && hashPrefix !== "") {
      console.warn(`[${LOGGER_CONTEXT}] hashPrefix ignored in history mode`);
    }
  }

  return hasInvalidTypes;
}
