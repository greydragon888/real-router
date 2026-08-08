// packages/hash-plugin/src/constants.ts

import { sharedUrlPluginDefaults } from "./browser-env";

import type { HashPluginOptions } from "./types";

/**
 * Router-behaviour defaults (`forceDeactivate`, `base`) come from
 * `browser-env` — one value for all three URL plugins, see
 * `sharedUrlPluginDefaults` for why. `hashPrefix` stays here: it is URL
 * mechanics this plugin owns alone. `Required<HashPluginOptions>` is the check
 * that every option is covered.
 */
export const defaultOptions: Required<HashPluginOptions> = {
  ...sharedUrlPluginDefaults,
  hashPrefix: "",
};

/**
 * Source identifier for transitions triggered by browser events.
 */
export const source = "popstate";

export const LOGGER_CONTEXT = "hash-plugin";
