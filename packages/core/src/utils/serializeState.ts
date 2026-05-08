/**
 * Custom serializer signature for {@link serializeState} (#606).
 *
 * Compatible with `JSON.stringify` (default) as well as `devalue.stringify`,
 * `superjson.stringify`, or any user-supplied function that returns a JSON
 * string. The output is run through XSS-safe character escapes regardless
 * of which serializer produced it.
 */
export type Serialize = (data: unknown) => string;

export interface SerializeStateOptions {
  /**
   * Custom serializer (e.g., `devalue.stringify` / `superjson.stringify`) to
   * support non-JSON types (Date / Map / Set / RegExp / BigInt). Defaults to
   * `JSON.stringify`. Output is still XSS-escaped.
   *
   * @default JSON.stringify
   */
  serialize?: Serialize;
}

/**
 * XSS-safe JSON serialization for embedding data in HTML `<script>` tags.
 *
 * Escapes `<`, `>`, and `&` to their Unicode equivalents to prevent
 * injection via `</script>` or HTML entities inside inline scripts.
 *
 * Pass `options.serialize` to use a custom serializer such as `devalue` or
 * `superjson` for non-JSON types (Date/Map/Set/RegExp/BigInt). The serializer
 * must return a string; XSS-escape is applied to its output.
 *
 * @example
 * ```typescript
 * const json = serializeState({ name: "home", path: "/" });
 * const html = `<script>window.__STATE__=${json}</script>`;
 * ```
 *
 * @example
 * ```typescript
 * import * as devalue from "devalue";
 *
 * const json = serializeState(
 *   { date: new Date(), tags: new Set(["a", "b"]) },
 *   { serialize: devalue.stringify },
 * );
 * ```
 */
export function serializeState(
  data: unknown,
  options?: SerializeStateOptions,
): string {
  const serialize = options?.serialize ?? JSON.stringify;
  // JSON.stringify returns undefined for top-level `undefined`, Symbol,
  // function, and other non-serializable values (lib.d.ts types it as
  // `string` but the runtime can return undefined). A custom serializer
  // that returns undefined for unsupported input is normalized the same way.
  const serialized = (serialize(data) as string | undefined) ?? "null";

  return serialized
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`)
    .replaceAll("&", String.raw`\u0026`);
}
