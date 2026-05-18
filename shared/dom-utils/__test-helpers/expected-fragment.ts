/**
 * Test helper: mirror of `encodeFragmentInline` from `link-utils.ts` used by
 * property tests in every adapter (`packages/{vue,preact,react,solid}/tests/
 * property/linkUtils.properties.ts` and `packages/svelte/tests/property/
 * buildHref.properties.ts`).
 *
 * Why a mirror, not an import of the real function: a property test that uses
 * the production implementation to compute its own expected value is a
 * tautology — any regression in `encodeFragmentInline` would be invisible.
 * We hand-roll the same algorithm so the test asserts an independent
 * derivation. Drift between this mirror and `encodeFragmentInline` is exactly
 * the signal property tests are supposed to surface.
 *
 * This file lives under `__test-helpers/` so the sync-dom-utils script can
 * exclude it from the Angular copy (it ships no production code), and so
 * bundlers (tsdown, svelte-package) tree-shake it out — nothing in
 * `src/index.ts` of any adapter imports from this directory.
 */

const PERCENT_ESCAPE_PROBE = /%[\dA-Fa-f]{2}/;

/**
 * Compute the expected fragment portion of an href for a given raw hash input.
 *
 * Mirrors the contract of `encodeFragmentInline`:
 *  1. If input contains `%XX`, try `decodeURIComponent` → `encodeURI` (idempotent
 *     re-encoding so consumers can copy-paste `location.hash` back in without
 *     `%20` becoming `%2520`).
 *  2. If `decodeURIComponent` throws (malformed `%XX`), fall through to plain
 *     `encodeURI` on the original input.
 *  3. Defensive `#` → `%23` (encodeURI does not encode `#`).
 */
export function computeExpectedFragment(rawHash: string): string {
  let roundtrip = rawHash;

  if (PERCENT_ESCAPE_PROBE.test(rawHash)) {
    try {
      roundtrip = decodeURIComponent(rawHash);
    } catch {
      // Malformed %XX — encodeFragmentInline falls through to plain
      // encodeURI on the original input, so do the same here.
    }
  }

  return encodeURI(roundtrip).replaceAll("#", "%23");
}
