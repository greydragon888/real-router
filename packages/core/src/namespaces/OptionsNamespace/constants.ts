// packages/core/src/namespaces/OptionsNamespace/constants.ts

import { DEFAULT_QUERY_PARAMS } from "../../engine";

import type { Options } from "../../types";

/**
 * Default options for the router.
 */
// No explicit `: Options` annotation — that would widen every field to the
// union `Options<DefaultDependencies>` declares, including the CALLBACK arm of
// `defaultRoute` / `defaultParams` / `defaultSearch`. `Options` is generic over
// the dependency map now, and a callback typed against `object` does not flow
// into an `Options<Deps>`. `satisfies` keeps the check while letting the
// inferred (callback-free) literal types stay assignable to any instantiation.
export const defaultOptions = {
  defaultRoute: "",
  defaultParams: {},
  defaultSearch: {},
  trailingSlash: "preserve",
  caseSensitive: true,
  queryParamsMode: "loose",
  queryParams: DEFAULT_QUERY_PARAMS,
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
} satisfies Options;

/**
 * The values each string-enum option accepts, and the resolvers that map
 * anything else onto the option's OWN default (#1831).
 *
 * ⚑ **They exist because the consumption sites ask "is it the default?" by
 * EQUALITY.** `ts === "preserve"`, `queryParamsMode === "loose"` — a value that
 * is neither the default nor any other member answers "no" there and travels on
 * as a real mode, so without resolution `trailingSlash` reaches the matcher as
 * `"never"` and `queryParamsMode` as `"default"`, and the second DROPS an
 * undeclared key out of `state.search`.
 *
 * ⚑ **Which sites need this, censused rather than guessed.** Only the ones that
 * compare against the option's DEFAULT: a site asking
 * `options.trailingSlash === "strict"` — a NON-default member — already answers
 * for an unrecognised value exactly as it answers for the default, so
 * `deriveMatcherOptions`' two booleans are correct untouched. `null` lands on
 * the default too, which is the `RouterOptions` rule that absence and `null`
 * mean the same thing.
 *
 * ⚑ **Resolved where the value is USED, never at adoption.** Rewriting it into
 * `options` puts the corrected value in front of
 * `@real-router/validation-plugin`, whose `validateOptions` reads that bag at
 * `usePlugin` — so the one diagnostic that exists goes silent. Measured: the
 * plugin stops throwing on a typo it throws on today.
 * `urlParamsEncoding`'s own fallback lives at its use site for the same reason
 * (`SegmentMatcher`'s constructor). Bare core still does not THROW: refusing a
 * value by NAME belongs to the plugin, which owns that list.
 *
 * ⚠ `satisfies` binds each member to the published union, so a typo here fails
 * to compile — it does NOT make the list exhaustive. A member added to the union
 * and not here would compile and silently stop being accepted;
 * `option-enum-authority-1831.test.ts` derives the unions from the type and owns
 * that half.
 */
export const TRAILING_SLASH_MODES = [
  "strict",
  "never",
  "always",
  "preserve",
] as const satisfies readonly Options["trailingSlash"][];

export const QUERY_PARAMS_MODES = [
  "default",
  "strict",
  "loose",
] as const satisfies readonly Options["queryParamsMode"][];

/**
 * ⚠ `value !== undefined` is a TYPE gate, not a runtime guard, in both resolvers
 * below: `includes` does not accept `undefined`, while at runtime an absent
 * value already misses the set and lands on the default anyway. Measured — a
 * mutant dropping it is EQUIVALENT, and it is named here rather than removed
 * because removing it costs a cast that says less.
 */
export function resolveTrailingSlash(
  value: Options["trailingSlash"] | undefined,
): Options["trailingSlash"] {
  return value !== undefined &&
    (TRAILING_SLASH_MODES as readonly string[]).includes(value)
    ? value
    : defaultOptions.trailingSlash;
}

export function resolveQueryParamsMode(
  value: Options["queryParamsMode"] | undefined,
): Options["queryParamsMode"] {
  return value !== undefined &&
    (QUERY_PARAMS_MODES as readonly string[]).includes(value)
    ? value
    : defaultOptions.queryParamsMode;
}
