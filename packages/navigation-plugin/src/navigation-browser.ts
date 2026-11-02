import { createHeldWrites, safelyEncodePath, extractPath } from "./browser-env";

import type { CurrentEntry, NavigationBrowser } from "./types";

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
 * Calls `landed` once the traversal's `committed` settles, and at once for a
 * test double that returns nothing. An unknown key rejects both promises, and
 * the browser marks neither handled (measured on Chromium 153, Firefox 155 and
 * WebKit 26.6).
 */
function onLanding(
  result: NavigationResult | undefined,
  landed: () => void,
): void {
  if (result?.committed) {
    void result.committed.then(landed, landed);
  } else {
    landed();
  }

  void result?.finished?.catch(() => undefined);
}

/** The entry a traversal in flight goes to; held writes move its `url`. */
interface LandingEntry extends CurrentEntry {
  url: string | null;
}

/**
 * Creates a NavigationBrowser wrapping the real Navigation API.
 * Only call this when `"navigation" in globalThis` is true.
 *
 * Every router-driven mutation (`navigate`, `replaceState`, `traverseTo`)
 * tags `info` with `PLUGIN_SYNC_INFO` so the navigate-event handler can
 * recognise and short-circuit the event it fires — see `PLUGIN_SYNC_INFO`
 * for the rationale. `updateCurrentEntry` is excluded because it fires
 * `currententrychange`, not `navigate`. Scroll-after-transition suppression
 * (`scroll: "manual"`) lives in `navigate-handler.ts`'s `NOOP_INTERCEPT`
 * — `scroll` is an `event.intercept()` option, not a `nav.navigate()`
 * option per WHATWG Navigation API spec.
 *
 * While a `traverseTo` travels, writes wait for its `committed` and
 * `currentEntry` answers the entry it goes to, at the URL the held writes leave
 * it: the plugin decides about the entry its write lands on (#2879). A
 * traversal started in that moment drops the writes held before it: the router
 * has moved past them.
 */
export function createNavigationBrowser(base: string): NavigationBrowser {
  const nav = globalThis.navigation;
  const writes = createHeldWrites();
  let landing: LandingEntry | undefined;
  const settle = (): void => {
    landing = undefined;
    writes.release();
  };
  const landingOn = (key: string): LandingEntry | undefined => {
    const entry = nav.entries().find((candidate) => candidate.key === key);

    return (
      entry && {
        key: entry.key,
        id: entry.id,
        index: entry.index,
        url: entry.url,
      }
    );
  };
  const write: NavigationBrowser["navigate"] = (url, options) => {
    writes.run(options.state, (state) => {
      // `committed` is left for the browser to report. It rejects only for a
      // write that did not happen, and it is the only signal of that the
      // plugin gets (#2877).
      nav.navigate(url, { ...options, state, info: PLUGIN_SYNC_INFO });
    });

    if (landing) {
      landing.url = new URL(url, globalThis.location.href).href;
    }
  };

  return {
    getLocation: () =>
      safelyEncodePath(extractPath(globalThis.location.pathname, base)) +
      globalThis.location.search,

    getHash: () => globalThis.location.hash,

    navigate: write,

    replaceState: (state, url) => {
      write(url, { state, history: "replace" });
    },

    updateCurrentEntry: (options) => {
      writes.run(options.state, (state) => {
        nav.updateCurrentEntry({ state });
      });
    },

    traverseTo: (key) => {
      const target = landingOn(key);

      landing = target;
      writes.hold(settle);

      onLanding(nav.traverseTo(key, TRAVERSE_OPTS), () => {
        if (landing === target) {
          settle();
        }
      });
    },

    addNavigateListener: (fn) => {
      nav.addEventListener("navigate", fn);

      return () => {
        nav.removeEventListener("navigate", fn);
        // Without the listener a write is a navigation that loads a document.
        landing = undefined;
        writes.drop();
      };
    },

    entries: () => nav.entries(),

    get currentEntry() {
      return landing ?? nav.currentEntry;
    },

    getActivationType: () => nav.activation?.navigationType,
  };
}
