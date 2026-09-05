---
"@real-router/core": patch
---

Comments naming `core-types`, a package folded into core, now name where the thing actually lives (#2112)

`packages/core-types` was folded into `packages/core` by #1520. Three comments in
core's own source still pointed at it: `internals.ts` sent a reader to
`core-types/src/api.ts` for `navigateToState`'s usage docs, `RouterError.ts`
named the interface it stays structurally compatible with as living there, and
`types/base.ts` explained that interface's existence as bridging "core-types and
real-router packages" — two packages that are now one, so the reason it gave had
stopped being a reason.

The line numbers are dropped rather than renumbered: the ranges do not carry over
to the merged file, so a number would have been a fresh guess wearing the
authority of a measurement.
