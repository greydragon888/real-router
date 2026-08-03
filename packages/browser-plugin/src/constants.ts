import type { BrowserPluginOptions } from "./types";

export const defaultOptions: Required<BrowserPluginOptions> = {
  // Default `false` respects `canDeactivate` guards on browser back/forward,
  // matching `navigation-plugin` (#524) and the core router. Apps that want the
  // browser's native history buttons to bypass guards (e.g. to avoid dead-end
  // UX) can opt in via `forceDeactivate: true`.
  //
  // It shipped as `true` from v0.1.0 and #524 left it there, on the stated
  // premise that confirm-on-back already worked here — measured false: the
  // guard was called zero times on a matched back/forward (#1645). Since #1643
  // the not-found arm of the SAME gesture did consult the guard, so one option
  // gave the two halves of one back button opposite answers.
  forceDeactivate: false,
  base: "",
};

/**
 * Source identifier for transitions triggered by browser events.
 * Used to distinguish browser-initiated navigation (back/forward buttons)
 * from programmatic navigation (router.navigate()).
 */
export const POPSTATE_SOURCE = "popstate";

export const LOGGER_CONTEXT = "browser-plugin";
