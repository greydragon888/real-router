/**
 * URL fragment ("hash") shared layer (#532).
 *
 * Both URL plugins (navigation-plugin, browser-plugin) claim the `"url"`
 * `state.context` namespace and write `UrlContext` on every transition.
 * Mutually exclusive at runtime — only one URL plugin is installed per router.
 *
 * Hash form: decoded, no leading "#" — symmetric to `params` (no leading "?").
 * Encoding to/from URL form happens at the boundary (URL build / URL parse).
 */

export interface UrlContext {
  /** Decoded fragment, no leading "#". Empty string when URL has no fragment. */
  hash: string;
  /** Whether `hash` differs from the previous transition's `state.context.url.hash`. */
  hashChanged: boolean;
}

/**
 * Encode for URL fragment per RFC 3986: preserves sub-delims (`&`, `=`, `?`,
 * `:`, etc.) and the path/query characters that `encodeURI` already leaves
 * alone. Defensively percent-escapes `#` (a stray `#` in a decoded fragment
 * would otherwise terminate the fragment in the rendered URL).
 *
 * `encodeURIComponent` over-encodes RFC-3986 sub-delims (`&` → `%26`) and is
 * therefore wrong for fragments.
 */
export function encodeHashFragment(decoded: string): string {
  return encodeURI(decoded).replaceAll("#", "%23");
}

/**
 * Decode a percent-encoded fragment. Falls back to the raw input on malformed
 * escapes — matches the resilience pattern in scroll-restore.
 */
export function decodeHashFragment(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Normalize user-provided hash input: strip ALL leading "#" characters. The
 * prop is documented to accept the fragment name without "#", but we accept a
 * leading "#" gracefully. Stripping ALL leading "#" (not just one) keeps the
 * function idempotent on pathological inputs like `"##section"` (accidental
 * double-hash / concatenation bugs) — `normalize(normalize(x)) === normalize(x)`
 * (property test G9 in `hash-encoding.properties.ts`).
 *
 * **STRICTLY-DECODED contract (#1211 / D1=A).** The input is treated as an
 * already-decoded fragment and is NOT decoded here. A second decode corrupted
 * literal-percent fragments (`"a%20b"` → `"a b"`, redirect URLs / serialized
 * tokens broken) and split the plugin↔adapter policy: the adapter `<Link>`
 * encoder (`encodeFragmentInline` in `shared/dom-utils/link-utils.ts`) is now
 * strict too, so both layers obey one canonical contract. Callers must pass a
 * DECODED fragment — do NOT pass raw `location.hash` (which is percent-encoded).
 */
export function normalizeHashInput(input: string): string {
  let stripped = input;

  while (stripped.startsWith("#")) {
    stripped = stripped.slice(1);
  }

  return stripped;
}

/**
 * Read the current browser hash in decoded form, no leading "#".
 * Accepts any object with a `getHash()` method — works for both `Browser`
 * (History API) and `NavigationBrowser` (Navigation API). SSR-safe via the
 * abstractions, which return `""` outside a real browser.
 */
export function getDecodedHash(browser: { getHash: () => string }): string {
  const raw = browser.getHash();

  if (!raw) {
    return "";
  }

  const stripped = raw.startsWith("#") ? raw.slice(1) : raw;

  return decodeHashFragment(stripped);
}
