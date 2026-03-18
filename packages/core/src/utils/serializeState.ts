/**
 * XSS-safe JSON serialization for embedding data in HTML `<script>` tags.
 *
 * Escapes `<`, `>`, and `&` to their Unicode equivalents to prevent
 * injection via `</script>` or HTML entities inside inline scripts.
 *
 * @example
 * ```typescript
 * const json = serializeState({ name: "home", path: "/" });
 * const html = `<script>window.__STATE__=${json}</script>`;
 * ```
 */
export function serializeState(data: unknown): string {
  if (data === undefined) {
    return "null";
  }

  return JSON.stringify(data)
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`)
    .replaceAll("&", String.raw`\u0026`);
}
