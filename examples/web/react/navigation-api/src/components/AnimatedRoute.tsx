import { useRoute } from "@real-router/react";

import type { JSX, ReactNode } from "react";

export function AnimatedRoute({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element {
  const { route } = useRoute();
  const direction = route?.context.navigation?.direction ?? "unknown";

  const className =
    direction === "back"
      ? "page slide-right"
      : direction === "forward"
        ? "page slide-left"
        : "page fade";

  return (
    <div className={className} key={route?.path ?? ""} data-direction={direction}>
      {children}
    </div>
  );
}
