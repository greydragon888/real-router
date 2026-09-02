---
"@real-router/core": patch
---

`systemCommit` reads the caller's `toState.transition` once ([#2008](https://github.com/greydragon888/real-router/issues/2008))

The door copies the State it is handed because `getInternals` is published, and
it spreads `transition` in conditionally so an absent field stays absent. That
conditional was two reads of the caller's slot — the `!== undefined` test, then
the value inside the spread — and the second answer is the one that committed.

Measured on an accessor-backed State answering a real meta first and `undefined`
second: the committed `transition` became the shared `EMPTY_PARAMS` singleton,
with `phase`, `reason` and `segments` — all three declared REQUIRED on
`TransitionMeta` — `undefined`, so `getState().transition` was literally the same
object as another state's `getState().params`. That is the outcome the
conditional spread exists to prevent, named in its own docblock.

The slot is now read once, above the literal, and both halves of the conditional
decide from that answer.
