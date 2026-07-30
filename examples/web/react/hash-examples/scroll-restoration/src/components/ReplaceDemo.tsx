import { useNavigator, useRoute } from "@real-router/react";

import type { JSX } from "react";

/**
 * Scenario 4 — Replace no-op. Calling navigate(..., { replace: true }) on
 * the current article navigates to the next id without resetting scroll.
 *
 * Utility writes putPos(keyOf(previousRoute), readPos()) BEFORE the rAF
 * callback's replace early-return — so position is saved under the OLD
 * params key, not the new one. Demonstrated via ScrollMeter store output.
 */
export function ReplaceDemo(): JSX.Element {
  const navigator = useNavigator();
  const { route } = useRoute<{ id: string }>();
  const currentId = Number(route.params.id);
  const nextId = String(currentId + 1);

  const onClick = (): void => {
    navigator
      .navigate("articles.article", { id: nextId }, undefined, {
        replace: true,
      })
      .catch(() => {
        /* noop — UI handles error via RouterErrorBoundary if needed */
      });
  };

  return (
    <button
      type="button"
      className="demo-button"
      data-testid="replace-next"
      onClick={onClick}
    >
      Next article (replace) → /articles/{nextId}
    </button>
  );
}
