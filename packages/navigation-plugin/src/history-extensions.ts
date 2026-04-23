import { extractPathFromAbsoluteUrl } from "./browser-env";

import type { NavigationBrowser } from "./types";
import type { State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Validates a candidate history entry for `traverseToLast(routeName)` and
 * returns both the entry (now known non-null) and the matched router state.
 * Extracted from `NavigationPlugin` so the three error branches (missing
 * entry, null url, unmatched url) can be tested directly without vi.spyOn
 * on module namespaces — the star-import spy pattern is fragile under ESM
 * and was working by accident in history-extensions.test.ts.
 *
 * Throws a descriptive Error on any failure; the caller (NavigationPlugin)
 * propagates it as the rejection of `traverseToLast`.
 */
export function resolveEntryToMatchedState(
  entry: NavigationHistoryEntry | undefined,
  routeName: string,
  api: PluginApi,
  base: string,
): { entry: NavigationHistoryEntry; matchedState: State } {
  if (!entry) {
    throw new Error(`No history entry for route "${routeName}"`);
  }

  if (!entry.url) {
    throw new Error(`No matching route for entry URL "${entry.url}"`);
  }

  const path = extractPathFromAbsoluteUrl(entry.url, base);
  const matchedState = api.matchPath(path);

  if (!matchedState) {
    throw new Error(`No matching route for entry URL "${entry.url}"`);
  }

  return { entry, matchedState };
}

/**
 * Converts a NavigationHistoryEntry to a State via URL matching.
 * Uses URL matching (not entry.getState()) because:
 * - Entries before plugin init have no state
 * - Entries after router.replace(routes) may have stale state
 * - Entries from other SPAs on the same origin have foreign state
 */
export function entryToState(
  entry: NavigationHistoryEntry | undefined,
  api: PluginApi,
  base: string,
): State | undefined {
  if (!entry?.url) {
    return undefined;
  }

  return (
    api.matchPath(extractPathFromAbsoluteUrl(entry.url, base)) ?? undefined
  );
}

function peekAt(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
  offset: number,
): State | undefined {
  const idx = browser.currentEntry?.index;

  if (idx == null) {
    return undefined;
  }

  return entryToState(browser.entries()[idx + offset], api, base);
}

export function peekBack(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
): State | undefined {
  return peekAt(browser, api, base, -1);
}

export function peekForward(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
): State | undefined {
  return peekAt(browser, api, base, 1);
}

export function hasVisited(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
  routeName: string,
): boolean {
  return browser.entries().some((entry) => {
    const state = entryToState(entry, api, base);

    return state?.name === routeName;
  });
}

export function getVisitedRoutes(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
): string[] {
  const names = new Set<string>();

  for (const entry of browser.entries()) {
    const state = entryToState(entry, api, base);

    if (state) {
      names.add(state.name);
    }
  }

  return [...names];
}

export function getRouteVisitCount(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
  routeName: string,
): number {
  let count = 0;

  for (const entry of browser.entries()) {
    if (entryToState(entry, api, base)?.name === routeName) {
      count++;
    }
  }

  return count;
}

/**
 * Finds the last NavigationHistoryEntry matching the given route name,
 * excluding the current entry (to avoid SAME_STATES on traverseToLast("current-route")).
 */
export function findLastEntryForRoute(
  entries: NavigationHistoryEntry[],
  routeName: string,
  api: PluginApi,
  base: string,
  currentKey: string | undefined,
): NavigationHistoryEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];

    if (entry.key === currentKey) {
      continue;
    }

    const state = entryToState(entry, api, base);

    if (state?.name === routeName) {
      return entry;
    }
  }

  return undefined;
}

export function canGoBack(browser: NavigationBrowser): boolean {
  const idx = browser.currentEntry?.index;

  return idx != null && idx > 0;
}

export function canGoForward(browser: NavigationBrowser): boolean {
  const idx = browser.currentEntry?.index;

  if (idx == null) {
    return false;
  }

  return idx < browser.entries().length - 1;
}

export function canGoBackTo(
  browser: NavigationBrowser,
  api: PluginApi,
  base: string,
  routeName: string,
): boolean {
  const idx = browser.currentEntry?.index;

  if (idx == null) {
    return false;
  }

  const entries = browser.entries();

  for (let i = idx - 1; i >= 0; i--) {
    const state = entryToState(entries[i], api, base);

    if (state?.name === routeName) {
      return true;
    }
  }

  return false;
}
