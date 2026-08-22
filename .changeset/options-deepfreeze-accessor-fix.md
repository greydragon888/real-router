---
"@real-router/core": minor
---

fix(core): the options deep-freeze no longer invokes the getters it seals (#1819, #1796)

`deepFreeze` walked the merged options with `Object.values`, which CALLS every
own-enumerable getter it passes. Sealing a slot needs no such read — the value is
wanted only to decide whether to recurse — so the walk now takes it off the
property DESCRIPTOR and an accessor is never invoked.

Two consequences, both measured against the version you are upgrading from:

- **A throwing accessor no longer takes the constructor down.** A `defaultParams`
  (or any nested option) exposing a value through a getter that throws used to
  escape `createRouter` as the application's own raw error, from inside the
  freeze. It now constructs.
- **⚠ A nested plain object behind a depth-≥2 accessor is no longer deep-frozen.**
  It used to be, so a caller who kept a reference can now write into it and
  `getOptions()` will report the write. The two goals are in direct conflict and
  cannot both be had — reaching that value means INVOKING the getter, which is
  the caller's code, which is exactly what this stops running. A getter on the
  options object ITSELF is unaffected: `OptionsNamespace` spreads the bag first,
  so the spread materialises it into a data property before the walk sees it.

⚠ **What this changeset deliberately does NOT claim.** An earlier draft sold it
on a compounding blow-up — a bag whose getter constructs another router branching
2ⁿ, "two million getter calls in 32 s". That is real, and it is a property of
this branch's own intermediate state: the second reader it compounds with is
`snapshotQueryParams`, which does not exist in the released version. Measured
there, the same re-entrant getter is linear (n+1) on both revisions. Describing
it as a fix to a shipped defect would have told consumers about a bug they never
had — the same mistake the sibling changeset in this release documents itself
avoiding.
