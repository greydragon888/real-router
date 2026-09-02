// packages/persistent-params-plugin/src/param-utils.ts

import { putField } from "@real-router/core/utils";

import type { Params } from "@real-router/core";

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
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;

/**
 * Copies a caller's bag into a fresh object, keeping its OWN keys only.
 *
 * ⚠ What this guarantees, precisely (#1810) — and it is narrower than "the
 * caller's bag comes back unchanged":
 *
 *   - an INHERITED key is dropped (`Object.hasOwn` gate). Measured:
 *     `Object.create({ inheritedKey: "X" })` plus an own `mode` comes back as
 *     `{ mode }`.
 *   - an OWN key is kept, WHATEVER it is called, and lands as ordinary data —
 *     including `"__proto__"`, and including a name the application happens to
 *     have put on `Object.prototype`. `putField` (#1852) is what makes the
 *     second half true; before it, an ambient accessor under a tracked param
 *     name took the value silently.
 *
 * ⚠ It does NOT strip `"__proto__"`, and the old example claimed it did
 * (`// { mode: 'dev' } (no __proto__)`). Two things were wrong with it. The
 * output DOES carry the key, as own data with the prototype intact; and the
 * input it built — the source literal `{ __proto__: { admin: true } }` inside
 * `Object.create(...)` — creates no own key of that name at all, so the example
 * exercised the inherited-key branch while describing the other one.
 *
 * Stripping it here would be redundant rather than safer: a name the plugin does
 * not track is filtered downstream (measured — an untracked `__proto__` in a
 * caller's bag reaches neither the URL, nor `state.search`, nor the published
 * context), and a name it DOES track can no longer be `"__proto__"`, because
 * `validateParamKey` refuses it at the factory (#1810).
 *
 * @param params - Parameters object (may carry inherited keys)
 * @returns New object carrying only the own keys of `params`
 *
 * @example
 * const bag = JSON.parse('{"mode":"dev","__proto__":{"marker":"INJ"}}');
 * const safe = extractOwnParams(bag);
 * // → { mode: 'dev', __proto__: {...} } — own data, prototype NOT swapped,
 * //   and `safe.marker` is undefined.
 */
export function extractOwnParams(params: Params): Params {
  const result: Params = {};

  for (const key in params) {
    // Skip inherited (e.g. prototype-polluted) keys — this is the boundary guard
    // the docstring describes; the "excludes inherited properties" unit test drives
    // an Object.create(proto) object through the `false` branch.
    if (hasOwn(params, key)) {
      // ⚑ The key is the CALLER's (#1852). Measured before this: an ambient
      // accessor made the guard that exists to sanitise a bag either throw or
      // drop the caller's key from the URL — the sanitiser as the leak.
      putField(result, key, params[key]);
    }
  }

  return result;
}

/**
 * Merges persistent and current parameters into a single Params object.
 *
 * IMPORTANT: `current` must be pre-sanitized via `extractOwnParams()` by the
 * caller — this function does not drop inherited keys on its own.
 *
 * ⚠ It does not need to guard the WRITE, though, and that half of the old
 * warning was misleading: both loops store through `putField` (#1852), so a
 * name the application put on `Object.prototype` cannot intercept them and an
 * own `"__proto__"` lands as ordinary data. What the caller owes it is the
 * own-key filter, nothing more.
 *
 * @param persistent - Frozen persistent parameters
 * @param current - Pre-sanitized current parameters (own properties only)
 */
export function mergeParams(
  persistent: Readonly<Params>,
  current: Params,
): Params {
  const result: Params = {};

  for (const key in persistent) {
    if (hasOwn(persistent, key) && persistent[key] !== undefined) {
      putField(result, key, persistent[key]);
    }
  }

  for (const [key, value] of objectEntries(current)) {
    if (value === undefined) {
      delete result[key];
    } else {
      putField(result, key, value);
    }
  }

  return result;
}
