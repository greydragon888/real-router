import type { SsrMode } from "./shared-ssr";
import type { State } from "@real-router/types";

/**
 * Returns the SSR mode resolved by `ssr-data-plugin` for the current state.
 * Falls back to `"full"` when the route has no plugin entry.
 *
 * Read this from `entry-server.tsx` to branch on full / data-only / client-only:
 * - `"full"` — render the full app, ship JSON + HTML.
 * - `"data-only"` — ship JSON only, render shell HTML.
 * - `"client-only"` — ship shell HTML and let the client fetch via its own mechanism.
 *
 * The mode is written to `state.context.ssrDataMode` by the plugin's `start`
 * interceptor for every route registered in the loaders map.
 */
export function getSsrDataMode(state: State): SsrMode {
  return (state.context as { ssrDataMode?: SsrMode }).ssrDataMode ?? "full";
}
