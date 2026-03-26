// packages/core/src/namespaces/PluginsNamespace/validators.ts

/**
 * Static validation functions for PluginsNamespace.
 * Called by Router facade before instance methods.
 */

import type { Plugin } from "@real-router/types";

/**
 * Validates that a plugin factory returned a valid plugin object.
 */
export function validatePlugin(plugin: Plugin): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!(plugin && typeof plugin === "object") || Array.isArray(plugin)) {
    throw new TypeError(
      `[router.usePlugin] Plugin factory must return an object, got ${typeof plugin}`,
    );
  }

  // Detect async factory (returns Promise)
  if (typeof (plugin as unknown as { then?: unknown }).then === "function") {
    throw new TypeError(
      `[router.usePlugin] Async plugin factories are not supported. ` +
        `Factory returned a Promise instead of a plugin object.`,
    );
  }
}
