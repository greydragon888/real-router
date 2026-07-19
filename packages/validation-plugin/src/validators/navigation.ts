// packages/validation-plugin/src/validators/navigation.ts

import {
  getTypeDescription,
  isNavigationOptions,
  isParams,
  isString,
} from "../type-guards";

import type { NavigationOptions } from "@real-router/core";

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
    if (!Object.hasOwn(params, key)) {
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
