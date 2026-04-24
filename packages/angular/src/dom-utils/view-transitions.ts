import type { Router } from "@real-router/core";

export interface ViewTransitions {
  destroy: () => void;
}

const NOOP_INSTANCE: ViewTransitions = Object.freeze({
  destroy: () => {
    /* no-op */
  },
});

export function createViewTransitions(router: Router): ViewTransitions {
  if (
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function"
  ) {
    return NOOP_INSTANCE;
  }

  let closeVT: (() => void) | null = null;
  let currentVT: { skipTransition?: () => void } | null = null;

  const resolveAndClear = (): void => {
    closeVT?.();
    closeVT = null;
  };

  const offLeave = router.subscribeLeave(({ signal }) => {
    resolveAndClear();

    currentVT = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          closeVT = resolve;
        }),
    );

    signal.addEventListener("abort", resolveAndClear, { once: true });
  });

  const offSuccess = router.subscribe(() => {
    const resolver = closeVT;

    closeVT = null;
    currentVT = null;

    // Wait one frame so the framework adapter (React/Vue/Solid/Svelte/Angular)
    // has committed the new DOM before VT snapshots the "after" state.
    if (resolver !== null) {
      requestAnimationFrame(() => {
        resolver();
      });
    }
  });

  return {
    destroy: () => {
      offLeave();
      offSuccess();
      currentVT?.skipTransition?.();
      currentVT = null;
      resolveAndClear();
    },
  };
}
