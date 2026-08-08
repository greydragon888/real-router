import { sharedUrlPluginDefaults } from "./browser-env";

import type { NavigationPluginOptions } from "./types";

/**
 * Router-behaviour defaults (`forceDeactivate`, `base`) come from
 * `browser-env` — one value for all three URL plugins, see
 * `sharedUrlPluginDefaults` for why. `Required<NavigationPluginOptions>` is the
 * check that every option is covered.
 */
export const defaultOptions: Required<NavigationPluginOptions> = {
  ...sharedUrlPluginDefaults,
};

/**
 * Source identifier for transitions triggered by navigate events.
 * Distinguishes browser-initiated navigation (back/forward, link clicks)
 * from programmatic navigation (router.navigate()).
 */
export const source = "navigate";

export const LOGGER_CONTEXT = "navigation-plugin";
