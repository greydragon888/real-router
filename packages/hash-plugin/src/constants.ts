// packages/hash-plugin/src/constants.ts

import type { HashPluginOptions } from "./types";

export const defaultOptions: Required<HashPluginOptions> = {
  hashPrefix: "",
  base: "",
  // Default `false` respects `canDeactivate` guards on browser back/forward,
  // matching `browser-plugin` and `navigation-plugin` (#524/#1645). A
  // deliberate bypass stays available via `forceDeactivate: true`.
  forceDeactivate: false,
};

/**
 * Source identifier for transitions triggered by browser events.
 */
export const source = "popstate";

export const LOGGER_CONTEXT = "hash-plugin";
