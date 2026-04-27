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

  const onPopstate = (): void => {
    popstateFlag = true;
  };

  // IMPORTANT — listener-ordering: `popstate` fires on `window`, which
  // has no DOM descendants, so capture phase is moot. Listeners are
  // dispatched in registration order. To beat the browser-plugin's own
  // popstate handler, this tracker must be installed **before**
  // `router.usePlugin(browserPluginFactory())` in user code. Otherwise
  // the plugin's handler runs first and synchronously fires
  // `subscribeLeave` while `popstateFlag` is still `false`.
  globalThis.addEventListener("popstate", onPopstate);

  const offLeave = router.subscribeLeave(() => {
    document.documentElement.dataset.navDirection = popstateFlag
      ? "back"
      : "forward";
    popstateFlag = false;
  });

  return {
    destroy: () => {
      offLeave();
      globalThis.removeEventListener("popstate", onPopstate);
      delete document.documentElement.dataset.navDirection;
    },
  };
}
