// packages/core/src/namespaces/OptionsNamespace/validators.ts

/**
 * Minimal crash guard for options.
 * Full DX validation moved to @real-router/validation-plugin (retrospective pattern).
 */

import { raiser } from "../../RouterError";

/** One binding per door this module refuses behind (#2487). */
const atRouter = raiser("router");

export function validateOptionsIsObject(
  options: unknown,
): asserts options is Record<string, unknown> {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw atRouter.type`options must be a plain object`;
  }
}
