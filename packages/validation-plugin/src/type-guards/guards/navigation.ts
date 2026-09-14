// packages/validation-plugin/src/type-guards/guards/navigation.ts

import type { NavigationOptions } from "@real-router/core";

/**
 * Captured at module load (#1971), like every deciding intrinsic in this package
 * — `validators/options.ts` states the doctrine. The read below is of THIS
 * module's own table rather than a caller's object, so the window is narrow, but
 * the rule is about the intrinsic and not about the argument. ⚠ The alternative
 * was `captured-intrinsics-authority-1971`'s exemption registry, which is empty:
 * measured, not a posture the scan declares — it documents only that an entry
 * needs a written reason. Capturing costs one line and argues about nothing.
 */
const objectKeys = Object.keys;

/**
 * The boolean fields of core's `NavigationOptions` — every key except `signal`,
 * which is an `AbortSignal` and is checked separately below.
 *
 * ⚑ Keyed by core's own type (#2311), the shape `LIMIT_BOUNDS` and
 * `KNOWN_QUERY_PARAMS` already use in `validators/options.ts`. A boolean field
 * core adds and this table does not is a TS2741 here, instead of a field the
 * guard silently admits ANY value for — which is what happened to `revalidate`
 * (#1201 added it; nothing said so here, and the neighbouring pin enumerated the
 * same five this list did, so it could not notice).
 *
 * ⚠ A `Record`, not an annotated array. An array typed
 * `readonly (keyof NavigationOptions)[]` binds each ELEMENT to the union and says
 * nothing about the SET, so a missing field still compiles — the two-level mirror
 * #2091 found in `expectedLimitKeys`.
 */
const NAVIGATION_OPTIONS_BOOLEAN_FIELDS: Record<
  Exclude<keyof NavigationOptions, "signal">,
  true
> = {
  replace: true,
  reload: true,
  force: true,
  forceDeactivate: true,
  redirected: true,
  revalidate: true,
};

// Derived ONCE at module load, not per call: the guard's loop walks an array so
// it allocates no iterator, and the `Record` above is what holds the set.
const NAVIGATION_OPTIONS_FIELDS = objectKeys(
  NAVIGATION_OPTIONS_BOOLEAN_FIELDS,
) as readonly (keyof NavigationOptions)[];

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
