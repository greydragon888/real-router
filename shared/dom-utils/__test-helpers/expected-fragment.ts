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

/**
 * Compute the expected fragment portion of an href for a given raw hash input.
 *
 * Mirrors the #1211 strictly-decoded contract of `encodeFragmentInline`: the
 * `hash` value is a DECODED fragment, encoded verbatim by
 * `encodeURI(s).replaceAll("#", "%23")`. There is NO `decodeURIComponent`
 * probe / round-trip — a literal `%` in the input is escaped to `%25` (so a
 * wire fragment fed back in double-encodes; that is the contract, not a bug).
 * This overturns the earlier Mini-sprint E.1 idempotency tolerance
 * (audit-2026-05-17 §5); the mirror re-derives the trivial formula so any
 * drift in `encodeFragmentInline` (or `encodeHashFragment`) still surfaces
 * here as a `buildHref` mismatch.
 */
export function computeExpectedFragment(rawHash: string): string {
  return encodeURI(rawHash).replaceAll("#", "%23");
}
