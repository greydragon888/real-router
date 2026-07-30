import { serializeState } from "./serializeState";

import type { Serialize } from "./serializeState";
import type { State } from "@real-router/core/types";

export interface SerializeRouterStateOptions {
  /**
   * Plugin context namespaces to strip from the serialized output.
   * Use when a plugin populates `state.context.<ns>` with non-JSON-serializable
   * values (e.g., RSC payload: ReactNode trees containing functions/symbols).
   *
   * @default []
   */
  excludeContext?: readonly string[];

  /**
   * Custom serializer (e.g., `devalue.stringify` / `superjson.stringify`) to
   * support non-JSON types in `state.params` and `state.context.<ns>` payloads
   * (Date / Map / Set / RegExp / BigInt). Defaults to `JSON.stringify`.
   *
   * Pair with the matching `deserialize` on `hydrateRouter` to round-trip the
   * extended types on the client.
   *
   * @default JSON.stringify
   *
   * @example
   * ```typescript
   * import * as devalue from "devalue";
   *
   * const json = serializeRouterState(state, { serialize: devalue.stringify });
   * ```
   */
  serialize?: Serialize;
}

/**
 * XSS-safe JSON serialization of router State for SSR → client transport (#563).
 *
 * Strips `state.transition` (per-navigation `TransitionMeta` — meaningless after
 * hydration; the client's hydration commit produces its own `transition`).
 * Keeps `name`, `params`, `search`, `path`, and `context` (plugin context
 * namespaces are preserved as-is — server's `state.context.data` from
 * `ssr-data-plugin` and any other plugin claims travel to the client
 * untouched).
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
 *
 * @example
 * ```typescript
 * // Non-JSON types (Date / Map / Set / RegExp / BigInt) via devalue (#606)
 * import * as devalue from "devalue";
 *
 * const json = serializeRouterState(state, { serialize: devalue.stringify });
 * // On the client:
 * await hydrateRouter(router, json, { deserialize: devalue.parse });
 * ```
 */
export function serializeRouterState(
  state: State,
  options?: SerializeRouterStateOptions,
): string {
  const exclude = options?.excludeContext;

  let context = state.context;

  if (exclude?.length) {
    // Null-proto target so a literal "__proto__" namespace (a real own key on
    // state.context, e.g. written by claimContextNamespace) is copied as a
    // genuine own entry by the plain assignment below — a `{}` target would
    // instead dispatch into the inherited Object.prototype.__proto__ setter and
    // silently drop the data (#1191, same hazard the write path guards).
    const filtered: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    const source = state.context;

    for (const [key, value] of Object.entries(source)) {
      if (!exclude.includes(key)) {
        filtered[key] = value;
      }
    }

    context = filtered;
  }

  const payload = {
    name: state.name,
    params: state.params,
    search: state.search,
    path: state.path,
    context,
  };

  return options?.serialize
    ? serializeState(payload, { serialize: options.serialize })
    : serializeState(payload);
}
