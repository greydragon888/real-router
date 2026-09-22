// packages/core/src/namespaces/PluginsNamespace/validators.ts

/**
 * Static validation functions for PluginsNamespace.
 * Called by Router facade before instance methods.
 */

import { raiser } from "../../RouterError";

import type { Plugin } from "../../types";

/** One binding per door this module refuses behind (#2487). */
const atUsePlugin = raiser("router", "usePlugin");

/**
 * Validates that a plugin factory returned a valid plugin object.
 */
export function validatePlugin(plugin: Plugin): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!(plugin && typeof plugin === "object") || Array.isArray(plugin)) {
    throw atUsePlugin.type`Plugin factory must return an object, got ${typeof plugin}`;
  }

  // Detect async factory (returns Promise)
  if (typeof (plugin as unknown as { then?: unknown }).then === "function") {
    throw atUsePlugin.type`Async plugin factories are not supported. Factory returned a Promise instead of a plugin object.`;
  }
}
