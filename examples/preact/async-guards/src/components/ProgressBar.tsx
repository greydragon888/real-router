import { useRouterTransition } from "@real-router/preact";

import type { JSX } from "preact";

export function ProgressBar(): JSX.Element | null {
  const { isTransitioning } = useRouterTransition();

  if (!isTransitioning) {
    return null;
  }

  return <div className="progress-bar" style={{ width: "100%" }} />;
}
