import type { NavigationPluginOptions } from "./types";

export const defaultOptions: Required<NavigationPluginOptions> = {
  forceDeactivate: true,
  base: "",
};

/**
 * Source identifier for transitions triggered by navigate events.
 * Distinguishes browser-initiated navigation (back/forward, link clicks)
 * from programmatic navigation (router.navigate()).
 */
export const source = "navigate";

export const LOGGER_CONTEXT = "navigation-plugin";
