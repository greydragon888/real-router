/**
 * Subpath export: the INGESTION primitives (#1852).
 *
 * ⚑ This is not "core's utils" and deliberately does not grow into one. It
 * carries core's own DISCIPLINE primitives — the rules a plugin has to obey for
 * the same reason core does, published so there is one implementation rather
 * than one per package. Two of them today, and a candidate earns its place by
 * being such a rule, not by being useful.
 *
 * **INGESTION (#1852)** — a bag handed in contributes DATA, and nothing else. No
 * trap, no accessor, no inherited member of it — and no accessor an application
 * put on the DESTINATION's prototype chain — may change what ends up stored.
 *
 * The router obeys that rule at every write of its own — the set is DERIVED by
 * `tests/functional/computed-key-write-authority-1852.test.ts`, not listed here,
 * so no count in prose can go stale against it. The plugins have to
 * obey it too, because a plugin that copies the caller's `params` / `search`
 * into a record of its own is writing under a key it did not choose, which is
 * the whole hazard: measured before the fix, an ambient accessor under an
 * ordinary param name made `persistent-params` drop a key from the URL with no
 * error, and made `search-schema` throw out of a navigation.
 *
 * **Why it is published rather than copied.** A copy per package is exactly how
 * this class acquired its earlier partial fixes — #855, #1191 and #1788 each
 * special-cased the literal `"__proto__"` in one file, none of them closed the
 * class, and all three had to be replaced here. The primitive ships once.
 *
 * ⚠ **Why the plugins cannot just use `Object.create(null)` instead.** They can,
 * semantically: a plugin's record never escapes — core copies it into a bag of
 * its own, so a prototype-less one does not reach `state.params` (measured).
 * What stops it is the price. V8 keeps such an object in dictionary mode, so the
 * cost lands on every later READ: measured end-to-end, `buildPath` through
 * `persistent-params` went **+19.5 %**, the same shape the same change measures
 * inside core — the figures are in `putField`'s docblock and are not repeated
 * here, because a number repeated is a number that goes stale in more than one
 * place. `putField` asks the chain once and pays only
 * where it answers.
 *
 * ⚠ Not the same subpath as the retired `@real-router/core/utils` (#1543). That
 * one held SSR helpers and was removed BECAUSE its content was SSR-specific and
 * belonged in `@real-router/ssr-utils` — a reason that does not transfer: this
 * content is core's own discipline, applied inside core first.
 */

export { copyFields, putField } from "./utils/ingest";

/**
 * **HAND-OUT (#1960 / #1964)** — an error a package THREW is not the thrower's to
 * keep mutable. One instance reaches every consumer of a dispatch — measured on
 * `onTransitionError`, the same object is handed to every plugin hook — so an
 * in-place write by one of them rewrites what the next one reads.
 *
 * Published because the three doors that reject from OUTSIDE core (a `usePlugin`
 * after start, an unmatched popstate, a Navigation API rollback) need the rule
 * core applies to its own throws, and an inline `Object.freeze` per site would
 * put the reason in three places.
 *
 * ⚠ Only for an error the caller CONSTRUCTED. Freezing a foreign error on the
 * way through is the hazard, not the fix — the same boundary core's own use of
 * it observes.
 */
export { freezeThrownError } from "./RouterError";
