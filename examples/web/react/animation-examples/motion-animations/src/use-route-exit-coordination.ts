import { useRouter } from "@real-router/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RouteExitCoordination {
  /**
   * Increments inside `subscribeLeave` before the router commits.
   * Pass as `key` to the page-level `<motion.div>` under
   * `<AnimatePresence>` — the key change triggers exit on the cached old
   * subtree (which still shows the old route's content because router
   * state hasn't moved yet).
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
 * Router-coordinated bridge between `subscribeLeave` and `AnimatePresence`.
 *
 * The router blocks on a Promise we return from `subscribeLeave`; the
 * Promise resolves when motion library's `onExitComplete` fires. URL and
 * UI stay in lock-step — same semantics as `route-animations/` and
 * `page-animations/`, but driven by motion's exit lifecycle instead of
 * `animationend` on a CSS keyframe.
 *
 * Same-route navigations (e.g. sort / filter param changes on the same
 * route name) skip the page-level exit/entry — inner motion components
 * (`<motion.li layout>`, `layoutId`) still react to data changes via the
 * library's own re-render-driven layout animations.
 *
 * Cancellation: when the router cancels a navigation (rapid clicks), the
 * `signal` aborts. We resolve the outdated Promise so the router can drain
 * the cancelled pipeline cleanly.
 */
export function useRouteExitCoordination(): RouteExitCoordination {
  const router = useRouter();
  const [exitToken, setExitToken] = useState(0);
  const exitResolverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return router.subscribeLeave(({ route, nextRoute, signal }) => {
      if (route.name === nextRoute.name) {
        return;
      }

      // Free a previous pending resolver — rapid clicks queue exits, and
      // the router cancels the older navigation. Resolving lets the
      // cancelled pipeline drain cleanly.
      exitResolverRef.current?.();

      return new Promise<void>((resolve) => {
        exitResolverRef.current = resolve;
        setExitToken((current) => current + 1);

        const onAbort = (): void => {
          if (exitResolverRef.current === resolve) {
            exitResolverRef.current = null;
            resolve();
          }
        };

        if (signal.aborted) {
          onAbort();

          return;
        }

        signal.addEventListener("abort", onAbort, { once: true });
      });
    });
  }, [router]);

  const onExitComplete = useCallback((): void => {
    const resolver = exitResolverRef.current;

    exitResolverRef.current = null;
    resolver?.();
  }, []);

  return { exitToken, onExitComplete };
}
