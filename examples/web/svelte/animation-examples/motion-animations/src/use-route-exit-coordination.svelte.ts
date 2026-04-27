import { useRouteExit } from "@real-router/svelte";

export interface RouteExitCoordination {
  /**
   * Reactive state value that bumps inside `subscribeLeave` before the
   * router commits. Use as the `{#key}` block value around the
   * page-level transitioning element — when it changes, Svelte's
   * `{#key}` re-instantiates the block, triggering the `out:`
   * transition on the cached old subtree (which still shows the old
   * route's content because router state hasn't moved yet).
   */
  exitToken: { current: number };
  /**
   * Pass to the page-level element's `onoutroend` event. Resolves the
   * Promise returned by `subscribeLeave`, unblocking the router so it
   * commits the new state — only then does the entering element mount
   * with the new route's content and play its `in:` transition.
   */
  onOutroEnd: () => void;
}

/**
 * Router-coordinated bridge between the leave-window and Svelte's
 * built-in `transition:` directives. The router blocks on a Promise
 * we return from `useRouteExit`; the Promise resolves when the page's
 * `onoutroend` event fires (or when the navigation is superseded —
 * the abort signal forwards through to keep the router pipeline
 * drainable).
 *
 * URL and UI stay in lock-step — same semantics as `route-animations/`
 * and `page-animations/`, but driven by Svelte's transition lifecycle
 * instead of `animationend` on a CSS keyframe or motion's
 * `onExitComplete`.
 *
 * Same-route navigations (e.g. sort / filter param changes on the
 * same route name) skip the page-level exit/entry —
 * `useRouteExit`'s default `skipSameRoute: true` handles this. The
 * `exitToken` is not bumped, so `{#key}` does not re-instantiate the
 * block.
 *
 * `useRouteExit`'s abort signal pre-check guarantees the handler does
 * not run for stale navigations, and the abort listener resolves the
 * in-flight Promise to drain the cancelled pipeline.
 *
 * Svelte handler-reactivity caveat: the composable runs once at
 * component init, so `exitResolver` lives as a plain `let` variable
 * in the closure (equivalent role to React's `useRef`). `exitToken`
 * uses a single-property `$state` object (the `.current` getter
 * pattern) so consumers can read it reactively from templates via
 * `exitToken.current`.
 */
export function useRouteExitCoordination(): RouteExitCoordination {
  const exitToken = $state({ current: 0 });
  let exitResolver: (() => void) | null = null;

  useRouteExit(({ signal }) => {
    return new Promise<void>((resolve) => {
      exitResolver = resolve;
      exitToken.current += 1;
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

  const onOutroEnd = (): void => {
    exitResolver?.();
    exitResolver = null;
  };

  return { exitToken, onOutroEnd };
}
