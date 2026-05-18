import type { State } from "@real-router/core";

/**
 * @internal
 *
 * Reads the URL fragment published by `browser-plugin` / `navigation-plugin`
 * on a router state. The plugins claim the `"url"` namespace via
 * `state.context.url` and the `hash` field carries the **decoded** fragment.
 *
 * Returns:
 * - `undefined` — no plugin claimed the `"url"` namespace (hash-plugin runtime,
 *   memory-plugin, SSR before hydration) OR the state itself is nullish;
 * - `""` — the URL namespace exists but the fragment is empty
 *   (browser-plugin on a hash-less URL).
 *
 * Callers that need the "no namespace at all" branch (e.g. `stabilizeState`
 * comparing cross-plugin transitions) read the raw `undefined`. Callers that
 * collapse "no namespace" to "no hash" (e.g. `createActiveRouteSource`'s
 * hash-equality check) coalesce with `?? ""` themselves.
 *
 * Centralising the context cast removes the previous duplicate definitions in
 * `stabilizeState.ts` and `createActiveRouteSource.ts` that drifted in
 * signature (state vs router) and default-value (undefined vs "") — both
 * variants are reconstructible from this single helper at the callsite.
 */
export function readContextHash(
  state: State | null | undefined,
): string | undefined {
  const ctx = state?.context as { url?: { hash?: string } } | undefined;

  return ctx?.url?.hash;
}
