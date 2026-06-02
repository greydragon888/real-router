import { useRoute } from "@real-router/react";

import type { JSX } from "react";

export function HashIndicator(): JSX.Element {
  const { route } = useRoute();
  const ctx = route.context as { url?: { hash?: string } };
  const hash = ctx.url?.hash ?? "";

  return (
    <div className="hash-indicator" data-testid="hash-indicator">
      <span className="hash-indicator__label">state.context.url.hash:</span>{" "}
      <code data-testid="hash-value">{hash || "(empty)"}</code>
    </div>
  );
}
