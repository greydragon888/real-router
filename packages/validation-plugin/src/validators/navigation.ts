// packages/validation-plugin/src/validators/navigation.ts

import {
  getTypeDescription,
  isNavigationOptions,
  isParams,
  isString,
} from "../type-guards";

import type { NavigationOptions } from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const hasOwn = Object.hasOwn;

export function validateNavigateArgs(name: unknown): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.navigate] Invalid route name: expected string, got ${getTypeDescription(name)}`,
    );
  }
}

export function validateNavigateToDefaultArgs(opts: unknown): void {
  if (opts !== undefined && (typeof opts !== "object" || opts === null)) {
    throw new TypeError(
      `[router.navigateToDefault] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
    );
  }
}

export function validateNavigateToStateArgs(state: unknown): void {
  if (typeof state !== "object" || state === null) {
    throw new TypeError(
      `[router.navigateToState] Invalid state: ${getTypeDescription(state)}. Expected State object.`,
    );
  }

  const candidate = state as { name: unknown; params: unknown; path: unknown };

  if (!isString(candidate.name)) {
    throw new TypeError(
      `[router.navigateToState] Invalid state.name: ${getTypeDescription(candidate.name)}. Expected string.`,
    );
  }
  if (!isParams(candidate.params)) {
    throw new TypeError(
      `[router.navigateToState] Invalid state.params: ${getTypeDescription(candidate.params)}. Expected plain object.`,
    );
  }
  if (!isString(candidate.path)) {
    throw new TypeError(
      `[router.navigateToState] Invalid state.path: ${getTypeDescription(candidate.path)}. Expected string.`,
    );
  }
}

export function validateNavigationOptions(
  opts: unknown,
  methodName: string,
): asserts opts is NavigationOptions {
  if (!isNavigationOptions(opts)) {
    throw new TypeError(
      `[router.${methodName}] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
    );
  }
}

// C0 control chars (U+0000–U+001F) and DEL (U+007F). Core percent-encodes them
// into the URL path (%00, %01, …) instead of failing, admitting unreadable,
// non-copyable paths into committed state (#942).
// eslint-disable-next-line no-control-regex -- matching control characters IS the validation here (#942)
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

/**
 * Rejects param VALUES that cannot safely round-trip through a URL path:
 * - `symbol` / `bigint` stringify lossily — a Symbol keeps its raw identity in
 *   `state.params` and never matches back from the path, so navigation
 *   "succeeds" with a corrupt, non-round-tripping path (#934);
 * - a `string` carrying control characters corrupts the path segment (#942).
 *
 * Pinpoints the offending key so the message is actionable, instead of the
 * generic "params must be a plain object" shape error.
 */
function assertValidParamValues(
  params: Record<string, unknown>,
  methodName: string,
): void {
  for (const key in params) {
    if (!hasOwn(params, key)) {
      continue;
    }

    const value = params[key];
    const valueType = typeof value;

    if (valueType === "symbol" || valueType === "bigint") {
      throw new TypeError(
        `[router.${methodName}] param "${key}" cannot be a ${valueType} — it does not round-trip through the URL path. Use a string, number, or boolean.`,
      );
    }

    if (valueType === "string" && CONTROL_CHARS_RE.test(value as string)) {
      throw new TypeError(
        `[router.${methodName}] param "${key}" must not contain control characters (NUL / C0 / DEL) — they corrupt the URL path.`,
      );
    }
  }
}

export function validateNavigateParams(
  params: unknown,
  methodName: string,
): void {
  if (params === undefined) {
    return;
  }

  // Inspect individual values first so a Symbol/BigInt/control-char value gets a
  // precise, value-specific message instead of the generic shape error below.
  if (typeof params === "object" && params !== null && !Array.isArray(params)) {
    assertValidParamValues(params as Record<string, unknown>, methodName);
  }

  if (!isParams(params)) {
    throw new TypeError(
      `[router.${methodName}] params must be a plain object, got ${getTypeDescription(params)}`,
    );
  }
}

/**
 * The QUERY channel's shape, the twin `validateParams` never had (#1972).
 *
 * ⚑ Shape only, and deliberately not the value inspection its path twin runs:
 * a query value is printed with `String()` and round-trips through the URL, so
 * the Symbol/BigInt/control-char rules that make a PATH segment unrepresentable
 * do not transfer. What was missing is that nothing asked whether the bag was a
 * bag at all — a string spread character by character into `state.search`.
 */
export function validateSearch(search: unknown, methodName: string): void {
  if (search === undefined) {
    return;
  }

  if (typeof search !== "object" || search === null || Array.isArray(search)) {
    throw new TypeError(
      `[router.${methodName}] search must be a plain object, got ${getTypeDescription(search)}`,
    );
  }
}

export function validateStartArgs(path: unknown): void {
  // undefined is allowed — browser-plugin injects path via interceptor AFTER facade validation
  if (path !== undefined && typeof path !== "string") {
    throw new TypeError(
      `[router.start] path must be a string, got ${getTypeDescription(path)}.`,
    );
  }
  if (typeof path === "string") {
    // #942: a NUL byte / control char would be silently percent-encoded into
    // state.path (%00, %01) by core — reject it with an actionable error.
    if (CONTROL_CHARS_RE.test(path)) {
      throw new TypeError(
        `[router.start] path must not contain control characters (NUL / C0 / DEL).`,
      );
    }
    if (path !== "" && !path.startsWith("/")) {
      throw new TypeError(
        `[router.start] path must start with "/", got "${path}".`,
      );
    }
  }
}
