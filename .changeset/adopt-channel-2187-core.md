---
"@real-router/core": minor
---

publish `adoptChannel` from `@real-router/core/utils` (#2187)

The subpath carried the WRITE half of the ingestion rule — `putField`,
`copyFields` — and not the ADOPT half, so a plugin that has to obey "judge the
caller's SHAPE, copy its VALUES" had no primitive to reach for and wrote its
own. The first out-of-core copy of those four lines got the predicate wrong — a
`typeof` gate spread a prototype-swapped literal into a plain object, turning a
refused shape into an accepted one — and its replacement then described it
inaccurately.

⚠ **The rule is `Object.prototype` BY IDENTITY, not "looks like a bag".** A
value whose prototype is neither `Object.prototype` nor `null` comes back BY
REFERENCE, and that is the contract: copying it first would hand the layer below
an acceptable object built out of one it refuses. The rows that matter are the
ones that look like a bag anyway — a swapped prototype and another realm's plain
object both carry ordinary own keys and are both returned unchanged. A consumer
must therefore REFUSE such a value rather than write to it: core's callers have
a validating door below them that does the refusing in its own words, a plugin
usually does not, and `adopted.x = 1` after a by-reference input lands on the
application's object.

Both spellings of "no bag" pass through unchanged and both are now in the
published overloads (`undefined` for `undefined`, `null` for `null`): `{ ...null }`
is `{}`, which turns "no bag" into "empty bag" above the code that tells them
apart.

The contract is stated at the DECLARATION rather than at the re-export, because
a re-export's docblock is not emitted — `dist/esm/utils.d.mts` carries the
re-export lines and none of the subpath's blocks, while the declaration sites'
own docblocks ship in full.

`adopt-channel-authority-2187` pins the rule per shape — the two that copy, the
five that come back by reference, one plain-object control that must copy, both
absent spellings, and one read per key.
