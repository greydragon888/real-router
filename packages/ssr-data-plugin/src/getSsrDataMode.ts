import { ALL_SSR_MODES, type SsrMode } from "./shared-ssr";

import type { State } from "@real-router/core";

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
 *
 * Defensive read: if `state.context.ssrDataMode` was set to something outside
 * `ALL_SSR_MODES` by a TS-cast bypass or a foreign writer, the function
 * collapses it to `"full"` rather than returning the bad value. Without this
 * guard, a downstream `mode === "full"` branch would silently misbehave for
 * `0`, `false`, `""`, `null`, or any unknown string.
 *
 * The read itself is wrapped in `try/catch` — a foreign writer that installs
 * a throwing getter (`Object.defineProperty(ctx, "ssrDataMode", { get() { throw … } })`)
 * cannot break the contract. The function NEVER throws, no matter how
 * adversarial the context shape. `"full"` is the safe default for any error.
 * Its `rsc-server-plugin` twin `getSsrRscMode` reads the same way, and the two
 * are meant to be substitutable (#1835).
 */
export function getSsrDataMode(state: State): SsrMode {
  let raw: unknown;

  try {
    raw = (state.context as { ssrDataMode?: unknown }).ssrDataMode;
  } catch {
    return "full";
  }

  return typeof raw === "string" && ALL_SSR_MODES.includes(raw as SsrMode)
    ? (raw as SsrMode)
    : "full";
}
