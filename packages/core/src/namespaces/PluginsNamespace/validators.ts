// packages/core/src/namespaces/PluginsNamespace/validators.ts

/**
 * Static validation functions for PluginsNamespace.
 * Called by Router facade before instance methods.
 */

import { getTypeDescription, isObjKey } from "type-guards";

import { EVENTS_MAP } from "./constants";
import { DEFAULT_LIMITS } from "../../constants";

import type { PluginFactory } from "../../types";
import type { DefaultDependencies, Plugin } from "@real-router/types";

/**
 * Validates usePlugin arguments - all must be functions.
 */
export function validateUsePluginArgs<D extends DefaultDependencies>(
  plugins: unknown[],
): asserts plugins is PluginFactory<D>[] {
  for (const plugin of plugins) {
    if (typeof plugin !== "function") {
      throw new TypeError(
        `[router.usePlugin] Expected plugin factory function, got ${typeof plugin}`,
      );
    }
  }
}

/**
 * Validates that a plugin factory returned a valid plugin object.
 */
export function validatePlugin(plugin: Plugin): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!(plugin && typeof plugin === "object") || Array.isArray(plugin)) {
    throw new TypeError(
      `[router.usePlugin] Plugin factory must return an object, got ${getTypeDescription(
        plugin,
      )}`,
    );
  }

  // Detect async factory (returns Promise)
  if (typeof (plugin as unknown as { then?: unknown }).then === "function") {
    throw new TypeError(
      `[router.usePlugin] Async plugin factories are not supported. ` +
        `Factory returned a Promise instead of a plugin object.`,
    );
  }

  for (const key in plugin) {
    if (!(key === "teardown" || isObjKey<typeof EVENTS_MAP>(key, EVENTS_MAP))) {
      throw new TypeError(
        `[router.usePlugin] Unknown property '${key}'. ` +
          `Plugin must only contain event handlers and optional teardown.`,
      );
    }
  }
}

/**
 * Validates that adding new plugins won't exceed the hard limit.
 */
export function validatePluginLimit(
  currentCount: number,
  newCount: number,
  maxPlugins: number = DEFAULT_LIMITS.maxPlugins,
): void {
  if (maxPlugins === 0) {
    return;
  }

  const totalCount = currentCount + newCount;

  if (totalCount > maxPlugins) {
    throw new Error(`[router.usePlugin] Plugin limit exceeded (${maxPlugins})`);
  }
}
