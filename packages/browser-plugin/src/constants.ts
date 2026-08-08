import { sharedUrlPluginDefaults } from "./browser-env";

import type { BrowserPluginOptions } from "./types";

/**
 * Router-behaviour defaults (`forceDeactivate`, `base`) come from
 * `browser-env` — one value for all three URL plugins, see
 * `sharedUrlPluginDefaults` for why. `Required<BrowserPluginOptions>` is the
 * check that every option is covered.
 */
export const defaultOptions: Required<BrowserPluginOptions> = {
  ...sharedUrlPluginDefaults,
};

/**
 * Source identifier for transitions triggered by browser events.
 * Used to distinguish browser-initiated navigation (back/forward buttons)
 * from programmatic navigation (router.navigate()).
 */
export const POPSTATE_SOURCE = "popstate";

export const LOGGER_CONTEXT = "browser-plugin";
