import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

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

  let transitionInFlight = false;
  let armedMidTransition = false;

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
  const onPopstate = (): void => {
    popstateFlag = true;
    // A deferred event belongs to the replay, not to the transition running
    // now, so that transition's terminal event must not spend it.
    armedMidTransition = transitionInFlight;
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

  const onSettled = (): void => {
    transitionInFlight = false;

    if (armedMidTransition) {
      armedMidTransition = false;

      return;
    }

    popstateFlag = false;
  };

  const unsubs = [
    api.addEventListener(events.TRANSITION_START, () => {
      transitionInFlight = true;
    }),
    api.addEventListener(events.TRANSITION_SUCCESS, onSettled),
    api.addEventListener(events.TRANSITION_ERROR, onSettled),
    api.addEventListener(events.TRANSITION_CANCEL, onSettled),
    router.subscribeLeave(() => {
      document.documentElement.dataset.navDirection = popstateFlag
        ? "back"
        : "forward";
      popstateFlag = false;
      armedMidTransition = false;
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
