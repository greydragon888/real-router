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
 * await hydrateRouter(router, window.__SSR_STATE__);
 * ```
 */
export function serializeRouterState(state: State): string {
  return serializeState({
    name: state.name,
    params: state.params,
    path: state.path,
    context: state.context,
  });
}
