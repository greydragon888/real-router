import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params, Router, SearchParams, State } from "@real-router/core";

type BuildUrl = (
  name: string,
  params: Params,
  search?: SearchParams,
  options?: { hash?: string },
) => string | undefined;

export interface DirectionTracker {
  destroy: () => void;
}

const NOOP_INSTANCE: DirectionTracker = Object.freeze({
  destroy: () => {
    /* no-op */
  },
});

/**
 * Track navigation direction (forward / back) and write it to
 * `<html data-nav-direction>` on every leave. CSS / JS readers consume
 * the attribute via `html[data-nav-direction="back"]` selectors or
 * `document.documentElement.dataset.navDirection`.
 *
 * Mechanism-agnostic — works identically whether downstream UI uses CSS
 * `@keyframes`, View Transitions pseudo-elements, or library state
 * (motion's `motion.div initial={{ x: ... }}`).
 *
 * Implementation:
 *   - On install, set `data-nav-direction="forward"` baseline.
 *   - Attach a `popstate` listener that flips an internal flag to
 *     `true`. Browser back/forward navigation triggers popstate; user
 *     clicks on `<Link>` / programmatic `router.navigate(...)` do not.
 *   - On every `subscribeLeave`, write
 *     `popstateFlag ? "back" : "forward"` and reset the flag.
 *   - A `popstate` that arrives while a transition is in flight arms the
 *     flag of the transition after it, which is the one a URL plugin starts
 *     for it.
 *
 * Returns `{ destroy }` to clean up the listener and clear the dataset
 * attribute.
 */
export function createDirectionTracker(router: Router): DirectionTracker {
  if (typeof document === "undefined") {
    return NOOP_INSTANCE;
  }

  let popstateFlag = false;

  document.documentElement.dataset.navDirection = "forward";

  // The `toState` the transition in flight was announced with.
  let inFlight: State | undefined;
  // The address of a popstate that arrived while a transition was in flight.
  // A URL plugin starts its traversal after that transition, so its flag is
  // kept apart from the one the transition in flight may own.
  let replay: string | undefined;

  // ⚑ The flag is SPENT by the transition it belongs to, whether or not that
  // transition reaches a leave phase (#1924). It is armed by any `popstate` on
  // `globalThis`, not only one the router consumes, so `history.back()` onto an
  // entry that resolves to the current state — core answers `SAME_STATES`, and
  // measured, that arc emits `TRANSITION_ERROR` with no `TRANSITION_START` and
  // no leave — would otherwise leave it armed indefinitely and publish the next
  // FORWARD navigation as "back".
  //
  // ⚠ A clock has no correct value to be set to. The leave phase is separated
  // from its popstate by every deactivation guard, and a guard may await
  // anything; the plugin also DEFERS a popstate that arrives during an
  // in-flight transition and replays it from that transition's `finally`. The
  // gap has no upper bound. Measured on the obvious choice: a task-boundary
  // expiry disarms a live navigation on ONE async `canDeactivate`.

  // The address the URL plugin prints a state at, or `undefined` without
  // one, or when its `buildUrl` throws or answers none.
  const hrefOf = (state: State): string | undefined => {
    const buildUrl = router.buildUrl as BuildUrl | undefined;

    if (buildUrl === undefined) {
      return undefined;
    }

    try {
      const hash = (state.context as { url?: { hash?: string } } | undefined)
        ?.url?.hash;
      const url = buildUrl(
        state.name,
        state.params,
        state.search,
        hash ? { hash } : undefined,
      );

      return url === undefined
        ? undefined
        : new URL(url, globalThis.location.href).href;
    } catch {
      return undefined;
    }
  };

  // ⚑ A traversal onto the URL of the router's own state starts no
  // transition: a URL plugin's return after a refused Back or Forward
  // (#2740), or a Back onto an entry holding that state. The URL comes from
  // the URL plugin's `buildUrl`; without one, every popstate arms the flag.
  const landsOnRouterState = (): boolean => {
    const state = router.getState();

    return state !== undefined && hrefOf(state) === globalThis.location.href;
  };

  const onPopstate = (): void => {
    if (landsOnRouterState()) {
      // The URL plugin returns after a traversal it refused or one a guard
      // cancelled quietly, and drops the popstate that waited behind it, so
      // the flag that popstate's replay would have spent ends here.
      if (inFlight === undefined) {
        popstateFlag = false;
      }

      return;
    }

    if (inFlight === undefined) {
      popstateFlag = true;
    } else {
      replay = globalThis.location.href;
    }
  };

  // IMPORTANT — listener-ordering: `popstate` fires on `window`, which
  // has no DOM descendants, so capture phase is moot. Listeners are
  // dispatched in registration order. To beat the browser-plugin's own
  // popstate handler, this tracker must be installed **before**
  // `router.usePlugin(browserPluginFactory())` in user code. Otherwise
  // the plugin's handler runs first and synchronously fires
  // `subscribeLeave` while `popstateFlag` is still `false`.
  globalThis.addEventListener("popstate", onPopstate);

  const api = getPluginApi(router);

  // The flag of a popstate that arrived during the transition passes to the
  // next one; the transition's own, unspent, ends with it.
  const onSettled = (): void => {
    inFlight = undefined;
    popstateFlag = replay !== undefined;
    replay = undefined;
  };

  // Core also reports a refusal that starts no transition on
  // `TRANSITION_ERROR`, and may do so while another transition runs. A
  // transition's own error carries a `toState` with that transition's
  // `context`, so another one does not settle it (#2779). With nothing in
  // flight every error settles: the `SAME_STATES` arc above spends the flag
  // that way.
  const onError = (toState: State | undefined): void => {
    if (inFlight === undefined || toState?.context === inFlight.context) {
      onSettled();

      return;
    }

    // A popstate that arrived while the transition runs may be the one this
    // refusal answers: a URL plugin handles a popstate that arrives during a
    // programmatic transition on the spot. It is, unless the refusal names
    // another address.
    const href = toState === undefined ? undefined : hrefOf(toState);

    if (href === undefined || href === replay) {
      replay = undefined;
    }
  };

  const unsubs = [
    api.addEventListener(events.TRANSITION_START, (toState: State) => {
      inFlight = toState;
    }),
    api.addEventListener(events.TRANSITION_SUCCESS, onSettled),
    api.addEventListener(events.TRANSITION_ERROR, onError),
    api.addEventListener(events.TRANSITION_CANCEL, onSettled),
    router.subscribeLeave(() => {
      document.documentElement.dataset.navDirection = popstateFlag
        ? "back"
        : "forward";
      popstateFlag = false;
    }),
  ];

  return {
    destroy: () => {
      for (const unsub of unsubs) {
        unsub();
      }

      globalThis.removeEventListener("popstate", onPopstate);
      delete document.documentElement.dataset.navDirection;
    },
  };
}
