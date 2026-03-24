import { useRouterTransition } from "@real-router/react";

import type { JSX } from "react";

export function ProgressBar(): JSX.Element | null {
  const { isTransitioning } = useRouterTransition();

  if (!isTransitioning) {
    return null;
  }

  return <div className="progress-bar" style={{ width: "100%" }} />;
}
