import { startsWithSegment } from "@real-router/route-utils";

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
  for (const segment of Object.keys(snippets)) {
    if (RESERVED_SLOT_NAMES.has(segment)) {
      continue;
    }
    if (startsWithSegment(routeName, prefix + segment)) {
      return segment;
    }
  }

  return "";
}
