// packages/browser-plugin/modules/constants.ts

import type { BrowserPluginOptions } from "./types";

export const defaultOptions: Required<BrowserPluginOptions> = {
  forceDeactivate: true,
  base: "",
};

/**
 * Source identifier for transitions triggered by browser events.
 * Used to distinguish browser-initiated navigation (back/forward buttons)
 * from programmatic navigation (router.navigate()).
 */
export const source = "popstate";

export const LOGGER_CONTEXT = "browser-plugin";
