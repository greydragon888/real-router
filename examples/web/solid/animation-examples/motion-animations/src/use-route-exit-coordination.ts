import { useRouteExit } from "@real-router/solid";
import { createSignal } from "solid-js";

export interface RouteExitCoordination {
  /**
   * Increments inside `subscribeLeave` before the router commits.
   * Pass as `key` to the page-level `<Motion.div>` under{" "}
   * `<Presence exitBeforeEnter>` — the key change triggers exit on the
   * cached old subtree (which still shows the old route's content
   * because router state hasn't moved yet).
   */
  exitToken: () => number;
  /**
   * Pass to the exiting `<Motion.div onMotionComplete>`. Resolves the
   * Promise returned by `subscribeLeave`, unblocking the router so it
   * commits the new state.
   *
   * `solid-motionone`'s `Presence` does not expose an
   * `onExitComplete`-style callback like motion-react's
   * `<AnimatePresence>` does, so we listen on the exiting{" "}
   * `<Motion.div>` directly. The `exiting` flag filters out enter
   * completions — `onMotionComplete` fires for both phases.
   */
  onMotionComplete: () => void;
}

/**
 * Router-coordinated bridge between the leave-window and{" "}
 * `<Presence>` from `solid-motionone`. The router blocks on a Promise
 * we return from `useRouteExit`; the Promise resolves when the exiting{" "}
 * `<Motion.div>` fires `onMotionComplete` (or when the navigation is
 * superseded — the abort signal forwards through to keep the router
 * pipeline drainable).
 *
 * URL and UI stay in lock-step — same semantics as `route-animations/`
 * and `page-animations/`, but driven by Motion One's exit lifecycle
 * instead of `animationend` on a CSS keyframe.
 *
 * Same-route navigations (e.g. sort / filter param changes on the same
 * route name) skip the page-level exit/entry — `useRouteExit`'s default{" "}
 * `skipSameRoute: true` handles this.
 *
 * `useRouteExit`'s abort signal pre-check guarantees the handler does
 * not run for stale navigations, and the abort listener resolves the
 * in-flight Promise to drain the cancelled pipeline.
 *
 * Solid handler-reactivity caveat: the hook runs once at mount, so{" "}
 * `exiting` and `exitResolver` live as plain `let` variables in the
 * closure (equivalent to React's `useRef` here).
 */
export function useRouteExitCoordination(): RouteExitCoordination {
  const [exitToken, setExitToken] = createSignal(0);
  let exiting = false;
  let exitResolver: (() => void) | null = null;

  useRouteExit(({ signal }) => {
    return new Promise<void>((resolve) => {
      exitResolver = resolve;
      exiting = true;
      setExitToken((current) => current + 1);
      // Wrapped in a no-arg arrow because `addEventListener` passes
      // the Event to its callback, but `resolve` accepts only{" "}
      // `void | PromiseLike<void>`.
      signal.addEventListener(
        "abort",
        () => {
          exiting = false;
          resolve();
        },
        { once: true },
      );
    });
  });

  const onMotionComplete = (): void => {
    // `onMotionComplete` fires for both enter and exit animations.
    // Filter via the `exiting` flag set in `useRouteExit` above —
    // resolve only on the exit phase, then arm for the next cycle.
    if (!exiting) {
      return;
    }

    exiting = false;
    exitResolver?.();
    exitResolver = null;
  };

  return { exitToken, onMotionComplete };
}
