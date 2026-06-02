import { useRoute } from "@real-router/react";

import type { JSX } from "react";

interface NavigationContext {
  direction?: "forward" | "back" | "unknown";
  navigationType?: "push" | "replace" | "traverse" | "reload";
}

/**
 * Compact badge showing the last navigation's direction + type. Stable
 * Playwright marker that navigation-plugin actually publishes context.
 */
export function DirectionBadge(): JSX.Element {
  const { route } = useRoute();
  const nav = (route.context as { navigation?: NavigationContext }).navigation;

  return (
    <span className="direction-badge" data-testid="direction-badge">
      {nav?.direction ?? "—"} / {nav?.navigationType ?? "—"}
    </span>
  );
}
