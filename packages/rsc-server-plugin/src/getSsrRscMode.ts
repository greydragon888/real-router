import type { RscSsrMode } from "./types";
import type { State } from "@real-router/types";

/**
 * Returns the SSR mode resolved by `rsc-server-plugin` for the current state.
 * Falls back to `"full"` when the route has no plugin entry.
 *
 * Read this from `entry-server.tsx` to branch on full vs client-only:
 * - `"full"` — render the Server Component tree, pipe Flight stream.
 * - `"client-only"` — ship shell HTML and let the client fetch via its own mechanism.
 *
 * The mode is written to `state.context.ssrRscMode` by the plugin's `start`
 * interceptor for every route registered in the loaders map.
 */
export function getSsrRscMode(state: State): RscSsrMode {
  return (state.context as { ssrRscMode?: RscSsrMode }).ssrRscMode ?? "full";
}
