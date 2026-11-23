// packages/core/src/namespaces/PluginsNamespace/validators.ts

/**
 * Static validation functions for PluginsNamespace, asked by the facade and by
 * the namespace itself.
 */

import { errorCodes } from "../../constants";
import { raiser } from "../../RouterError";

import type { Plugin } from "../../types";

/** One binding per door this module refuses behind (#2487). */
const atUsePlugin = raiser("router", "usePlugin");

/**
 * Refuses an install on a disposed router (#1196).
 *
 * Asked by the facade on entry, and by the namespace before each factory runs
 * and after the last application code of that plugin's start. Application code
 * runs between them — a factory, a check, a diagnostic handler, the logger
 * callback — and any of it can `dispose()` the router.
 */
export function validateNotDisposed(isDisposed: boolean): void {
  if (isDisposed) {
    throw atUsePlugin.code(
      errorCodes.ROUTER_DISPOSED,
    )`cannot install a plugin on a disposed router — dispose() is terminal`;
  }
}

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
