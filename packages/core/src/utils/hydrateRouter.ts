import type { Router, State } from "@real-router/types";

/**
 * Hydrate a fresh router from server-serialized State (#563).
 *
 * Accepts either a JSON string (parsed via `JSON.parse`) or a State-shaped
 * object. Extracts `state.path` and delegates to `router.start(state.path)` —
 * the canonical URL is the source of truth for the router on hydration.
 *
 * The serialized State (produced by `serializeRouterState`) is still useful
 * for application-level concerns: `state.context.<namespace>` payloads (e.g.
 * server-side data from `ssr-data-plugin`) can be read separately by app code
 * before or after `hydrateRouter` resolves.
 *
 * @example
 * ```typescript
 * // Client
 * const router = createAppRouter();
 * router.usePlugin(browserPluginFactory());
 * await hydrateRouter(router, window.__SSR_STATE__);
 * ```
 */
export function hydrateRouter(
  router: Router,
  source: string | { path: string },
): Promise<State> {
  const parsed =
    typeof source === "string"
      ? (JSON.parse(source) as { path: string })
      : source;

  return router.start(parsed.path);
}
