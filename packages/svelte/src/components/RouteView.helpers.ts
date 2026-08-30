import { startsWithSegment } from "@real-router/route-utils";

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
const objectKeys = Object.keys;

// Snippet names reserved by RouteView for non-segment slots. Iteration in
// `getActiveSegment` skips these so they don't accidentally match a route.
const RESERVED_SLOT_NAMES = new Set(["self", "notFound"]);

export function getActiveSegment(
  routeName: string,
  node: string,
  snippets: Record<string, unknown>,
): string {
  const prefix = node ? `${node}.` : "";

  // Own enumerable keys only: `for...in` also walks inherited members, so an
  // enumerable extension some library left on Object.prototype would be
  // treated as an active slot and matched against route names (#1853).
  for (const segment of objectKeys(snippets)) {
    if (RESERVED_SLOT_NAMES.has(segment)) {
      continue;
    }
    if (startsWithSegment(routeName, prefix + segment)) {
      return segment;
    }
  }

  return "";
}
