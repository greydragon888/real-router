import { useRouteExit } from "@real-router/vue";
import { ref } from "vue";

import type { Ref } from "vue";

export interface RouteExitCoordination {
  /**
   * Reactive counter that bumps inside `subscribeLeave` before the
   * router commits. Use as the `:key` on the page-level transitioning
   * element under `<Transition mode="out-in">` — when it changes, Vue
   * unmounts the old element (triggering the `leave` transition on
   * the cached old subtree, which still shows the old route's content
   * because router state hasn't moved yet) and mounts a new one
   * (triggering the `enter` transition).
   */
  exitToken: Ref<number>;
  /**
   * Pass to `<Transition>`'s `@after-leave` event. Resolves the
   * Promise returned by `subscribeLeave`, unblocking the router so it
   * commits the new state — only then does the entering element mount
   * with the new route's content.
   */
  onAfterLeave: () => void;
}

/**
 * Router-coordinated bridge between the leave-window and Vue's
 * built-in `<Transition>` component. The router blocks on a Promise
 * we return from `useRouteExit`; the Promise resolves when
 * `<Transition>` fires its `@after-leave` event (or when the
 * navigation is superseded — the abort signal forwards through to
 * keep the router pipeline drainable).
 *
 * URL and UI stay in lock-step — same semantics as
 * `route-animations/` and `page-animations/`, but driven by Vue's
 * transition lifecycle instead of `animationend` on a CSS keyframe
 * or motion's `onExitComplete`.
 *
 * Same-route navigations (e.g. sort / filter param changes on the
 * same route name) skip the page-level exit/entry —
 * `useRouteExit`'s default `skipSameRoute: true` handles this. The
 * `exitToken` is not bumped, so `<Transition>` does not see a key
 * change and stays put.
 *
 * `useRouteExit`'s abort signal pre-check guarantees the handler does
 * not run for stale navigations, and the abort listener resolves the
 * in-flight Promise to drain the cancelled pipeline.
 *
 * Vue handler-reactivity caveat: the composable runs once at
 * `setup()`, so `resolver` lives as a plain `let` variable in the
 * closure (equivalent role to React's `useRef`). `exitToken` is a
 * `ref<number>` so consumers can read it reactively from templates.
 */
export function useRouteExitCoordination(): RouteExitCoordination {
  const exitToken = ref(0);
  let resolver: (() => void) | null = null;

  useRouteExit(({ signal }) => {
    return new Promise<void>((resolve) => {
      resolver = resolve;
      exitToken.value += 1;
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

  const onAfterLeave = (): void => {
    resolver?.();
    resolver = null;
  };

  return { exitToken, onAfterLeave };
}
