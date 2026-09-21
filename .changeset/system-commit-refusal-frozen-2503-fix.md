---
"@real-router/core": patch
---

A refusal built by a helper is frozen like every other one (#2503)

`systemCommit` refuses through a private helper — `throw this.#refuseSystemCommit()`
— and the throw site added nothing, so the caller received an **unfrozen**
`RouterError` while the same file freezes its five other throws. A consumer that
annotates a caught error therefore threw on some codes and not others, which is
the asymmetry #1960 set out to remove.

Reachable from a `start` interceptor: `router.navigateToNotFound(path)` there is
refused with `NOT_STARTED`, and `Object.isFrozen` on what the caller catches was
`false`. It is now `true`.

⚑ **This was the third instance of one class** — #1960 fixed it for cached versus
freshly built errors in core, #1964 for three plugin sites, and both predicates
looked for a refusal built where it is thrown. So the fix ships with a guard
rather than alone: `prefixless-refusal-doors-2459` now asserts that every
`RouterError` a caller receives is frozen, across all 22 doors it drives plus the
helper seam. Measured both ways: the helper-seam cell reds on this defect alone, and neutering `freezeThrownError` reds three cells of the file — so the door table asserts something about freezing rather than passing on a tree that happens to be frozen.
