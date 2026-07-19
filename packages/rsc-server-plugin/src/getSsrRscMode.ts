import { ALLOWED_RSC_MODES } from "./constants";

import type { RscSsrMode } from "./types";
import type { State } from "@real-router/core";

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
 *
 * Defensive read: if `state.context.ssrRscMode` was set to something outside
 * `ALLOWED_RSC_MODES` by a TS-cast bypass or a foreign writer, the function
 * collapses it to `"full"` rather than returning the bad value. Without this
 * guard, a downstream `mode === "full"` branch would silently misbehave for
 * `0`, `false`, `""`, `null`, or any unknown string.
 *
 * The read itself is wrapped in `try/catch` — a foreign writer that installs
 * a throwing getter (`Object.defineProperty(ctx, "ssrRscMode", { get() { throw … } })`)
 * cannot break the contract. The function NEVER throws, no matter how
 * adversarial the context shape. `"full"` is the safe default for any error.
 */
export function getSsrRscMode(state: State): RscSsrMode {
  let raw: unknown;

  try {
    raw = (state.context as { ssrRscMode?: unknown }).ssrRscMode;
  } catch {
    return "full";
  }

  return typeof raw === "string" &&
    ALLOWED_RSC_MODES.includes(raw as RscSsrMode)
    ? (raw as RscSsrMode)
    : "full";
}
