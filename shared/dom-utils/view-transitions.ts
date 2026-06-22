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
  // Tracks whether TRANSITION_SUCCESS fired for the current leave. Used to
  // distinguish "benign cleanup abort" (router's async path aborts its own
  // controller in a finally block after successful navigation) from "real
  // cancellation" (concurrent navigate, guard rejection, dispose).
  let successFired = false;

  const resolveAndClear = (): void => {
    closeVT?.();
    closeVT = null;
  };

  const offLeave = router.subscribeLeave(({ signal }) => {
    // Reentrant abort: signal already aborted when we're called. Open no VT
    // — router will fall through to TRANSITION_CANCELLED via isCurrentNav()
    // after leave resolves. addEventListener("abort", ...) does not re-fire
    // for past events, so skipping startViewTransition is the safe path.
    if (signal.aborted) {
      return;
    }

    successFired = false;
    resolveAndClear();

    // Return a Promise so the router awaits until the browser invokes
    // updateCallback. This ensures old DOM snapshot is captured BEFORE the
    // router commits the new state — giving correct exit→state→entry
    // ordering (vs fire-and-forget, where URL changes before VT captures).
    return new Promise<void>((resolveLeave) => {
      // Capture the resolver synchronously BEFORE startViewTransition() is
      // called. The browser invokes updateCallback in a later task, but
      // router.subscribe (TRANSITION_SUCCESS) can fire before that. If we
      // captured `resolve` inside the callback, subscribe would see closeVT
      // still null and skip resolving — the deferred would hang for 4s
      // until the VT API aborts with TimeoutError.
      // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- frozen shared primitive; resolver captured synchronously before startViewTransition() by design (see comment above)
      const deferred = new Promise<void>((resolve) => {
        closeVT = resolve;
      });

      signal.addEventListener(
        "abort",
        () => {
          if (successFired) {
            // Router's async path (#finishAsyncNavigation) aborts its own
            // controller in a finally block AFTER completeTransition (and
            // thus AFTER subscribe fired). This is cleanup, not
            // cancellation — VT is progressing normally, do nothing.
            return;
          }

          // Real cancellation (concurrent navigate, dispose). Resolve the
          // deferred so updateCallback can complete, skip the VT so no
          // stale animation leaks, and unblock the router if the abort
          // fires before updateCallback was invoked.
          resolveAndClear();
          currentVT?.skipTransition?.();
          resolveLeave();
        },
        { once: true },
      );

      try {
        currentVT = document.startViewTransition(() => {
          // Resolving here unblocks the router at the moment the browser
          // enters updateCallback — by spec, old DOM snapshot is captured
          // before this callback runs. Router now proceeds through
          // activation guards and setState; the VT animation waits on
          // `deferred`, which is resolved from router.subscribe after a
          // task-queue tick (see NOTE on setTimeout below).
          resolveLeave();

          return deferred;
        });
      } catch {
        // Defensive: spec says startViewTransition doesn't throw under
        // normal conditions, but Chromium has had edge cases (detached
        // document, extension interference). Clean up and unblock router.
        resolveAndClear();
        resolveLeave();
      }
    });
  });

  const offSuccess = router.subscribe(() => {
    const resolver = closeVT;

    successFired = true;
    closeVT = null;

    if (resolver === null) {
      currentVT = null;
    } else {
      // CRITICAL: CANNOT use requestAnimationFrame here. When the router
      // takes the async path (leave returned a Promise), subscribe fires
      // AFTER the browser has already transitioned VT into the
      // "update-callback-called" phase. In that phase Chromium sets
      // rendering suppression to true, which ALSO blocks rAF callbacks.
      // rAF would never fire → deferred never resolves → browser aborts
      // vt.ready with TimeoutError after 4s (observed in Chromium).
      //
      // setTimeout runs on the task queue independent of the rendering
      // pipeline, so it fires regardless of suppression. React's scheduler
      // uses MessageChannel tasks, which are queued before our setTimeout,
      // so the new DOM is committed by the time our callback runs.
      setTimeout(() => {
        resolver();
        currentVT = null;
      }, 0);
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
