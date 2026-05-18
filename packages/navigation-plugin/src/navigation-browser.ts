import { safelyEncodePath, extractPath } from "./browser-env";

import type { NavigationBrowser } from "./types";

/**
 * Sentinel carried on `event.info` for every router-driven mutation.
 *
 * The navigate-event handler reads `event.info === PLUGIN_SYNC_INFO` to detect
 * plugin-originated events and short-circuit them with a noop intercept.
 * Identity-based detection works regardless of whether the navigate event is
 * delivered synchronously inside `nav.navigate(...)` (Chromium) or
 * asynchronously on the next task (Safari 26.2 WKWebView — #580).
 *
 * The previous `SyncingFlag` mechanism raised a per-instance boolean before
 * the call and lowered it in a synchronous `finally`. Under Safari WKWebView
 * the flag was already `false` by the time the event arrived, so the handler
 * treated the plugin's own write as user-initiated and re-issued
 * `router.navigate(...)` — render loop on macOS 26.2 Tauri release.
 *
 * Consumers supplying a custom `NavigationBrowser` should pass this value as
 * `info` in their `nav.navigate` / `nav.traverseTo` calls so the plugin can
 * recognise plugin-initiated events. See packages/navigation-plugin/CLAUDE.md.
 */
export const PLUGIN_SYNC_INFO = "@real-router/navigation-plugin:syncing";

// `traverseTo` options never carry per-call data — the sentinel `info` is the
// only field — so a single frozen constant is reused across every traversal.
// Saves one allocation per `nav.traverseTo` on the hot path.
const TRAVERSE_OPTS: NavigationOptions = Object.freeze({
  info: PLUGIN_SYNC_INFO,
});

/**
 * Creates a NavigationBrowser wrapping the real Navigation API.
 * Only call this when `"navigation" in globalThis` is true.
 *
 * Every router-driven mutation (`navigate`, `replaceState`, `traverseTo`)
 * tags `info` with `PLUGIN_SYNC_INFO` so the navigate-event handler can
 * recognise and short-circuit the event it fires — see `PLUGIN_SYNC_INFO`
 * for the rationale. `updateCurrentEntry` is excluded because it fires
 * `currententrychange`, not `navigate`.
 */
export function createNavigationBrowser(base: string): NavigationBrowser {
  const nav = globalThis.navigation;

  return {
    getLocation: () =>
      safelyEncodePath(extractPath(globalThis.location.pathname, base)) +
      globalThis.location.search,

    getHash: () => globalThis.location.hash,

    navigate: (url, options) => {
      nav.navigate(url, { ...options, info: PLUGIN_SYNC_INFO });
    },

    replaceState: (state, url) => {
      nav.navigate(url, {
        state,
        history: "replace",
        info: PLUGIN_SYNC_INFO,
      });
    },

    updateCurrentEntry: (options) => {
      nav.updateCurrentEntry(options);
    },

    traverseTo: (key) => {
      nav.traverseTo(key, TRAVERSE_OPTS);
    },

    addNavigateListener: (fn) => {
      nav.addEventListener("navigate", fn);

      return () => {
        nav.removeEventListener("navigate", fn);
      };
    },

    entries: () => nav.entries(),

    get currentEntry() {
      return nav.currentEntry;
    },

    getActivationType: () => nav.activation?.navigationType,
  };
}
