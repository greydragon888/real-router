import { useRoute } from "@real-router/react";

import type { JSX, ReactNode } from "react";

function resolveClassName(direction: string): string {
  if (direction === "back") {
    return "page slide-right";
  }
  if (direction === "forward") {
    return "page slide-left";
  }

  return "page fade";
}

export function AnimatedRoute({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element {
  const { route } = useRoute();
  const direction = route.context.navigation?.direction ?? "unknown";
  const className = resolveClassName(direction);

  return (
    <div className={className} key={route.path} data-direction={direction}>
      {children}
    </div>
  );
}
