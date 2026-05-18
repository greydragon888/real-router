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

  for (const segment in snippets) {
    if (RESERVED_SLOT_NAMES.has(segment)) {
      continue;
    }
    if (startsWithSegment(routeName, prefix + segment)) {
      return segment;
    }
  }

  return "";
}
