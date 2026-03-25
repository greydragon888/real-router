// packages/core/src/namespaces/OptionsNamespace/validators.ts

/**
 * Minimal crash guard for options.
 * Full DX validation moved to @real-router/validation-plugin (retrospective pattern).
 */
export function validateOptionsIsObject(
  options: unknown,
): asserts options is Record<string, unknown> {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("[router.constructor] options must be a plain object");
  }
}
