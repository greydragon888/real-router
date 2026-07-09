export interface HistoryBrowser {
  pushState: (state: unknown, path: string) => void;
  replaceState: (state: unknown, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  /**
   * Subscribe to `hashchange`. Fired for same-document fragment navigations
   * that the plugin did NOT drive itself — native anchors (`<a href="#/x">`),
   * manual address-bar hash edits, and `location.hash = ...` from app code.
   * `pushState`/`replaceState` (the plugin's own writes) never fire it, so it
   * is a clean external-change channel. Used by hash-plugin (`#` carries the
   * route) and by browser-plugin to keep its cached fragment fresh without a
   * per-navigation `location.hash` read (#532 forces a sync pushState commit).
   * (#759, #1019)
   */
  addHashChangeListener: (fn: (evt: HashChangeEvent) => void) => () => void;
  getHash: () => string;
  /**
   * Reads the current `history.state`. Used on popstate success to detect when
   * the browser has already restored the exact `{name, params, path}` the
   * transition resolved to — in which case the plugin's own `replaceState` is a
   * value-level no-op and can be skipped, avoiding a redundant
   * `updateForSameDocumentNavigation` Blink event on back/forward (#1353).
   *
   * Optional so a custom `Browser` predating this method still type-checks; when
   * absent the plugin keeps the unconditional write (no skip, legacy behavior).
   * The default browser (`createSafeBrowser`) always provides it.
   */
  getState?: () => unknown;
}

export interface Browser extends HistoryBrowser {
  getLocation: () => string;
}

/**
 * Shared mutable state across plugin instances created by the same factory.
 * Enables cleanup of a previous instance's popstate listener when the factory
 * is reused.
 *
 * Factory-pool caveat — last-wins (#758): because this slot is shared, each
 * `onStart` removes the previous instance's popstate listener before installing
 * its own. The pattern is built for a pool where routers are created/destroyed
 * **sequentially**. If two routers from the same factory are live **at the same
 * time** on one window, only the LAST-started one tracks `popstate` — the
 * earlier one silently desyncs from the URL (there is one `popstate` stream and
 * one URL; who owns it is inherently ambiguous). For multiple concurrently-live
 * routers, give each its own factory instance.
 */
export interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
  /**
   * Remover for the `hashchange` listener (see `addHashChangeListener`).
   * Same factory-pool last-wins semantics as `removePopStateListener`.
   */
  removeHashChangeListener?: (() => void) | undefined;
}
