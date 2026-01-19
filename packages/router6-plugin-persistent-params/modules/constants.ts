// packages/router6-plugin-persistent-params/modules/constants.ts

/**
 * Symbol to mark router as initialized with this plugin.
 * Prevents double initialization and memory leaks from method wrapping.
 */
export const PLUGIN_MARKER = Symbol("persistent-params-plugin");
