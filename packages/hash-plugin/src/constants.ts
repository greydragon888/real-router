// packages/hash-plugin/src/constants.ts

import type { HashPluginOptions } from "./types";

export const defaultOptions: Required<HashPluginOptions> = {
  hashPrefix: "",
  base: "",
  forceDeactivate: true,
};

/**
 * Source identifier for transitions triggered by browser events.
 */
export const source = "popstate";

export const LOGGER_CONTEXT = "hash-plugin";
