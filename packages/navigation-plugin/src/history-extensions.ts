import { extractPath } from "./url-utils";

import type { NavigationBrowser } from "./types";
import type { State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

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

  const pathname = new URL(entry.url).pathname;
  const path = extractPath(pathname, base);

  return api.matchPath(path) ?? undefined;
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
  return browser.entries().filter((entry) => {
    const state = entryToState(entry, api, base);

    return state?.name === routeName;
  }).length;
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
