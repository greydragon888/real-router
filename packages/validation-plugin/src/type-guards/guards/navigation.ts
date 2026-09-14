// packages/validation-plugin/src/type-guards/guards/navigation.ts

import type { NavigationOptions } from "@real-router/core";

/**
 * The boolean fields of core's `NavigationOptions` — every key except `signal`,
 * which is an `AbortSignal` and is checked separately below.
 *
 * ⚠ **NOT keyed `Record<keyof NavigationOptions, true>`, and the reason is
 * measured (#2311).** That interface is OPEN: `browser-plugin`, `hash-plugin` and
 * `navigation-plugin` augment it, so `keyof` answers differently depending on
 * which plugins the compilation unit can see — seven keys from inside this
 * package, ten from inside `@real-router/react`. An exhaustive `Record` is
 * therefore ill-defined: it compiles here and fails in every consumer that
 * installs a URL plugin. Measured — it did, on `@real-router/react#type-check`.
 * The sibling tables in `validators/options.ts` ARE keyed that way because
 * `Options`, `QueryParamsOptions` and `LoggerConfig` are augmented by nobody.
 *
 * ⚑ Exhaustiveness against CORE is held instead by
 * `core-union-mirror-authority-2091`, which walks core's declaration in the
 * SOURCE FILE. Augmentations are invisible to a file walk, so it asks exactly the
 * question the type cannot: does this list carry every field core itself
 * declares? `satisfies` below adds the other direction — a name that is not a
 * navigation option at all fails to compile.
 *
 * ⚠ A plugin's own augmented booleans are deliberately unchecked. This package
 * cannot enumerate them, and claiming otherwise is what the open interface makes
 * impossible rather than merely hard.
 */
const NAVIGATION_OPTIONS_FIELDS = [
  "replace",
  "reload",
  "force",
  "forceDeactivate",
  "redirected",
  "revalidate",
] as const satisfies readonly Exclude<keyof NavigationOptions, "signal">[];

/**
 * Type guard for NavigationOptions.
 * Validates all optional boolean fields, derived from core's type (#2311).
 *
 * @param value - Value to check
 * @returns true if value is a valid NavigationOptions object
 *
 * @example
 * isNavigationOptions({ replace: true });                    // true
 * isNavigationOptions({ reload: false, force: true });       // true
 * isNavigationOptions({ replace: "true" });                  // false (not boolean)
 * isNavigationOptions(null);                                 // false
 */
export function isNavigationOptions(
  value: unknown,
): value is NavigationOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // for-of instead of .every() - no iterator/callback allocation
  for (const field of NAVIGATION_OPTIONS_FIELDS) {
    const fieldValue = obj[field];

    if (fieldValue !== undefined && typeof fieldValue !== "boolean") {
      return false;
    }
  }

  // Validate signal field
  const signalValue = obj.signal;

  return signalValue === undefined || signalValue instanceof AbortSignal;
}
