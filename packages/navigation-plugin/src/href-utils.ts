/**
 * Pure URL-comparison helper extracted from `plugin.ts` so it can be unit and
 * property-tested in isolation. See INVARIANTS.md section K for the formal
 * properties this function satisfies.
 *
 * Sole production call site: the same-URL guard in
 * `NavigationPlugin.onTransitionSuccess` (#580).
 */

/**
 * Returns `true` when resolving `target` (a relative or absolute URL) against
 * `currentHref` identifies the same logical document — same protocol, host,
 * pathname (with empty pathname normalised to `"/"`), search, and hash.
 *
 * Why component-wise (not raw `.href` equality):
 *
 * For **special schemes** (`http:`, `https:`, `ws:`, `wss:`, `file:`) the URL
 * parser canonicalises empty pathname to `"/"`, so `http://x` and `http://x/`
 * share the same `.href` and either comparison would work.
 *
 * For **non-special schemes** (`tauri://`, `app://`, custom protocols used by
 * Tauri/Electron) the parser preserves the empty pathname:
 *
 *   new URL("tauri://localhost").href         === "tauri://localhost"
 *   new URL("/", "tauri://localhost").href    === "tauri://localhost/"
 *
 * A naive `.href` equality would treat these as different. `nav.navigate("/")`
 * against `tauri://localhost` would then go through the navigate path — and
 * under Safari 26.2 WKWebView that round-trip triggers a cross-document
 * reload (the #580 root cause). The first time the user observed this, the
 * `same-URL guard` fix only kicked in on the SECOND iteration (after the
 * URL had been auto-normalised to include the trailing slash). Component-
 * wise comparison with `pathname || "/"` closes that first-iteration hole.
 *
 * Returns `false` when:
 * - `currentHref` is null, undefined or empty (SSR fallback / pre-start),
 * - either URL construction throws (malformed input).
 *
 * Total over all string inputs: never throws.
 *
 * @internal — exported for property testing; not part of the public surface.
 */
export function isSameHref(
  target: string,
  currentHref: string | null | undefined,
): boolean {
  if (!currentHref) {
    return false;
  }

  try {
    const resolved = new URL(target, currentHref);
    const base = new URL(currentHref);

    return (
      resolved.protocol === base.protocol &&
      resolved.host === base.host &&
      (resolved.pathname || "/") === (base.pathname || "/") &&
      resolved.search === base.search &&
      resolved.hash === base.hash
    );
  } catch {
    return false;
  }
}
