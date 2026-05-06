import { getInternals } from "../internals";

import type { SerializedRouterState } from "./serializeRouterState";
import type { Router, State } from "@real-router/types";

/**
 * Hydrate a fresh router from server-serialized State (#563, #596).
 *
 * Accepts either a JSON string (parsed via `JSON.parse`) or a State-shaped
 * object. Extracts `state.path` and delegates to `router.start(state.path)` —
 * the canonical URL is the source of truth for the router on hydration.
 *
 * The full parsed state (incl. `state.context.<namespace>` payloads) is
 * deposited into a one-shot scratchpad on `RouterInternals.hydrationState`
 * before `start()` is invoked and cleared in the matching `finally`. SSR
 * loader plugins (`@real-router/ssr-data-plugin`,
 * `@real-router/rsc-server-plugin`) read this scratchpad to skip their loader
 * call when the server-resolved namespace value is already present — avoiding
 * the post-hydration loader re-run on first paint.
 *
 * Single-shot semantics: the scratchpad is consumed during the first `start()`
 * triggered by `hydrateRouter` regardless of route mismatch; subsequent
 * `start()` calls run loaders normally.
 *
 * @example
 * ```typescript
 * // Client
 * const router = createAppRouter();
 * router.usePlugin(browserPluginFactory());
 * await hydrateRouter(router, window.__SSR_STATE__);
 * ```
 */
export async function hydrateRouter(
  router: Router,
  source: string | { path: string },
): Promise<State> {
  const parsed =
    typeof source === "string"
      ? (JSON.parse(source) as SerializedRouterState)
      : (source as SerializedRouterState);

  const ctx = getInternals(router);
  const previous = ctx.hydrationState;

  ctx.hydrationState = parsed;

  try {
    return await router.start(parsed.path);
  } finally {
    ctx.hydrationState = previous;
  }
}
