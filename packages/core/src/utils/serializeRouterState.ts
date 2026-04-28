import { serializeState } from "./serializeState";

import type { State } from "@real-router/types";

/**
 * XSS-safe JSON serialization of router State for SSR → client transport (#563).
 *
 * Strips `state.transition` (per-navigation `TransitionMeta` — meaningless after
 * hydration; the client's hydration commit produces its own `transition`).
 * Keeps `name`, `params`, `path`, and `context` (plugin context namespaces are
 * preserved as-is — server's `state.context.data` from `ssr-data-plugin` and
 * any other plugin claims travel to the client untouched).
 *
 * @example
 * ```typescript
 * // Server
 * const state = await router.start(req.url);
 * const html = `<script>window.__SSR_STATE__=${serializeRouterState(state)}</script>`;
 *
 * // Client
 * const state = JSON.parse(window.__SSR_STATE__);
 * await router.start(state);  // or hydrateRouter(router, state)
 * ```
 */
export function serializeRouterState(state: State): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to strip transition from the serialized payload
  const { transition, ...persistent } = state;

  return serializeState(persistent);
}
