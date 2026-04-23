import type { NavigationPluginOptions } from "./types";

export const defaultOptions: Required<NavigationPluginOptions> = {
  // Default `false` respects `canDeactivate` guards on browser back/forward,
  // matching the documented contract of `browser-plugin` and the core router.
  // Apps that want the browser's native history buttons to bypass guards
  // (e.g. to avoid dead-end UX) can opt in via `forceDeactivate: true`.
  forceDeactivate: false,
  base: "",
};

/**
 * Source identifier for transitions triggered by navigate events.
 * Distinguishes browser-initiated navigation (back/forward, link clicks)
 * from programmatic navigation (router.navigate()).
 */
export const source = "navigate";

export const LOGGER_CONTEXT = "navigation-plugin";
