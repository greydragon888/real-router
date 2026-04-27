import { useRouteExit } from "@real-router/preact";
import { useCallback, useRef, useState } from "preact/hooks";

export interface RouteExitCoordination {
  /**
   * Increments inside `subscribeLeave` before the router commits.
   * Pass as `key` to the page-level `<motion.div>` under
   * `<AnimatePresence>` — the key change triggers exit on the cached
   * old subtree (which still shows the old route's content because
   * router state hasn't moved yet).
   */
  exitToken: number;
  /**
   * Pass to `<AnimatePresence onExitComplete>`. Resolves the Promise
   * returned by `subscribeLeave`, unblocking the router so it commits
   * the new state — only then does the entering motion.div mount with
   * the new route's content.
   */
  onExitComplete: () => void;
}

/**
 * Router-coordinated bridge between the leave-window and
 * `<AnimatePresence>`. The router blocks on a Promise we return from
 * `useRouteExit`; the Promise resolves when motion library's
 * `onExitComplete` fires (or when the navigation is superseded — the
 * abort signal forwards through to keep the router pipeline drainable).
 *
 * URL and UI stay in lock-step — same semantics as `route-animations/`
 * and `page-animations/`, but driven by motion's exit lifecycle instead
 * of `animationend` on a CSS keyframe.
 *
 * Same-route navigations (e.g. sort / filter param changes on the same
 * route name) skip the page-level exit/entry — `useRouteExit`'s default
 * `skipSameRoute: true` handles this. Inner motion components
 * (`<motion.li layout>`, `layoutId`) still react to data changes via
 * the library's own re-render-driven layout animations.
 *
 * `useRouteExit`'s abort signal pre-check guarantees the handler does
 * not run for stale navigations, and the abort listener resolves the
 * in-flight Promise to drain the cancelled pipeline.
 */
export function useRouteExitCoordination(): RouteExitCoordination {
  const [exitToken, setExitToken] = useState(0);
  const exitResolverRef = useRef<(() => void) | null>(null);

  useRouteExit(({ signal }) => {
    return new Promise<void>((resolve) => {
      exitResolverRef.current = resolve;
      setExitToken((current) => current + 1);
      // Wrapped in a no-arg arrow because `addEventListener` passes
      // the Event to its callback, but `resolve` accepts only
      // `void | PromiseLike<void>`.
      signal.addEventListener(
        "abort",
        () => {
          resolve();
        },
        { once: true },
      );
    });
  });

  const onExitComplete = useCallback((): void => {
    exitResolverRef.current?.();
    exitResolverRef.current = null;
  }, []);

  return { exitToken, onExitComplete };
}
