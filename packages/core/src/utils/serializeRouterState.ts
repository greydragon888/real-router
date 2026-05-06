import { serializeState } from "./serializeState";

import type { Params, State } from "@real-router/types";

/**
 * Parsed shape produced by {@link serializeRouterState} (after `JSON.parse`).
 *
 * Identical to {@link State} minus `transition` (per-navigation `TransitionMeta`
 * is meaningless after hydration; the client builds its own on commit). Used as
 * the input shape for {@link hydrateRouter} and as the type of the one-shot
 * hydration scratchpad consumed by SSR loader plugins.
 */
export type SerializedRouterState<P extends Params = Params> = Omit<
  State<P>,
  "transition"
>;

export interface SerializeRouterStateOptions {
  /**
   * Plugin context namespaces to strip from the serialized output.
   * Use when a plugin populates `state.context.<ns>` with non-JSON-serializable
   * values (e.g., RSC payload: ReactNode trees containing functions/symbols).
   *
   * @default []
   */
  excludeContext?: readonly string[];
}

/**
 * XSS-safe JSON serialization of router State for SSR → client transport (#563).
 *
 * Strips `state.transition` (per-navigation `TransitionMeta` — meaningless after
 * hydration; the client's hydration commit produces its own `transition`).
 * Keeps `name`, `params`, `path`, and `context` (plugin context namespaces are
 * preserved as-is — server's `state.context.data` from `ssr-data-plugin` and
 * any other plugin claims travel to the client untouched).
 *
 * Pass `options.excludeContext` to strip specific namespaces from the output —
 * required for plugins that publish non-JSON-serializable values (e.g., RSC
 * `ReactNode` trees from `@real-router/rsc-server-plugin`).
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
 *
 * @example
 * ```typescript
 * // With RSC plugin: strip the "rsc" namespace before transport
 * const state = await router.start(url);
 * const json = serializeRouterState(state, { excludeContext: ["rsc"] });
 * ```
 */
export function serializeRouterState(
  state: State,
  options?: SerializeRouterStateOptions,
): string {
  const exclude = options?.excludeContext;

  let context = state.context;

  if (exclude?.length) {
    const filtered: Record<string, unknown> = {};
    const source = state.context as Record<string, unknown>;

    for (const key of Object.keys(source)) {
      if (!exclude.includes(key)) {
        filtered[key] = source[key];
      }
    }

    context = filtered;
  }

  return serializeState({
    name: state.name,
    params: state.params,
    path: state.path,
    context,
  });
}
