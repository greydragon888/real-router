import { useNavigator, useRoute } from "@real-router/react";

import type { JSX } from "react";

/**
 * Scenario 7c — Programmatic reload.
 * navigate(name, params, undefined, { reload: true }) with same path triggers
 * `deriveNavigationType → "reload"`, which makes the utility's rAF callback
 * take the restore branch and writePos from store.
 */
export function ProgrammaticReloadDemo(): JSX.Element {
  const navigator = useNavigator();
  const { route } = useRoute<{ id: string }>();

  const onClick = (): void => {
    navigator
      .navigate("articles.article", { id: route.params.id }, undefined, {
        reload: true,
      })
      .catch(() => {
        /* noop */
      });
  };

  return (
    <button
      type="button"
      className="demo-button"
      data-testid="programmatic-reload"
      onClick={onClick}
    >
      Programmatic reload (same id, reload: true)
    </button>
  );
}
