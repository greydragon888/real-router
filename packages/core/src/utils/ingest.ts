// packages/core/src/utils/ingest.ts
//
// First step of #1901 — one discipline for the records core BUILDS under a
// caller-derived key. Wired at `buildParamMeta` and the segment-meta walk
// (#1825); the remaining doors of the class follow one at a time.
//
// ⚠ These are WRITE-side primitives only, and the boundary is deliberate. A
// READ-side primitive that walks a caller's prototype chain was written here,
// wired, measured — and removed: `CLAUDE.md` "Supported Input Shapes" settles
// that axis already ("own enumerable properties only", owner decision
// 2026-08-18), and core is the layer that DEGRADES on a violation while
// `@real-router/validation-plugin` is the layer that reports it. A primitive
// that honoured inherited keys would have made core contradict its own canon,
// and it additionally admitted the ambient `Object.prototype` — the #1840
// class, introduced by the fix.
//
// So what is left is the half the canon does not cover: what happens when core
// writes into a record of its own under a key it did not choose.

/**
 * The target discipline: a record with NO prototype.
 *
 * ⚑ This one line closes two axes at once, which is why it is a primitive and
 * not an idiom. #1856 tabulates them as a structural trade — a key-by-key copy
 * fixes `"__proto__"` but turns a `[[DefineOwnProperty]]` into a `[[Set]]`, so
 * an ambient accessor starts throwing — and calls the conflict unavoidable. It
 * is unavoidable only while the target inherits from `Object.prototype`:
 *
 *   - `"__proto__"` (#1825, #1794, #1809) is an ordinary key here, because the
 *     magic accessor lives on `Object.prototype` and this object has none.
 *   - an ambient accessor named `id` / `page` / `tab` (#1852) cannot hijack the
 *     write for the same reason. #1852 notes the key's provenance is
 *     irrelevant — `SegmentMatcher` writes a name from the ROUTE TABLE and
 *     throws just the same — so a name-based skip cannot close it and this can.
 */
export function emptyRecord<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

/**
 * Hand a privately-built record out with the ORDINARY prototype, keeping every
 * own key — including a literal `"__proto__"`.
 *
 * Discovered by measurement, not designed: wiring `emptyRecord` into
 * `buildParamMeta` alone reds **21** existing tests, all of the shape
 * `expected { id: 'url' } to strictly equal { id: 'url' }` — identical content,
 * different prototype, because `toStrictEqual` compares prototypes and
 * `paramTypeMap` is published through `getPluginApi(router).getTree()`. A
 * prototype-less record is not a drop-in at a published surface.
 *
 * The spread is what makes this work rather than undo it: it
 * `[[DefineOwnProperty]]`s, so an own `"__proto__"` carried on the private
 * record lands as an ordinary own key here (measured: own keys
 * `["__proto__","keep"]`, value intact, prototype back to `Object.prototype`).
 * Writing that same key into a fresh `{}` with `[[Set]]` loses it entirely
 * (measured: own keys `[]`) — which is the defect the private record exists to
 * avoid.
 *
 * So the rule is: **build private, publish plain.** The window in which the
 * ambient-accessor hazard (#1852) could bite is the build, and the build never
 * touches `Object.prototype`.
 */
export function publishRecord<V>(source: Record<string, V>): Record<string, V> {
  return { ...source };
}
