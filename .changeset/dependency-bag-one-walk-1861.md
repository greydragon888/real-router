---
"@real-router/core": minor
---

A dependency bag is judged and copied in a single walk (#1861)

The judge and the copier were two `Object.keys` calls on the same object, one
after the other. For an ordinary object the two walks return the same set and the
verdict covers what is installed; for a `Proxy` they need not, because `ownKeys`
is a trap and a trap may answer differently on its second invocation. Measured on
bare core with a bag answering `[]` and then `["evil"]`: the guard walked an empty
set and passed, the copier walked a non-empty one, and `evil` was installed
**unjudged** — with the caller's `get` trap invoked once along the way.

Both halves now happen in one pass, so "installed but not judged" is
unconstructible rather than guarded against. Construction also enumerates the
caller's bag once instead of twice.

The refusal is atomic: keys are staged during the walk and installed only after
it completes, so a bag whose third key is a getter leaves the store exactly as it
was rather than half-written.

⚠ **The getter ban's limit is unchanged and is not what this closes.** A `Proxy`
that reports a data descriptor and runs code from its `get` trap still gets that
code run, because the copier must read a value to install it — measured, a bag
with a *stable* `ownKeys` defeats the ban exactly as well as a drifting one. What
the ban enforces, it enforces against ordinary objects; `packages/core/CLAUDE.md`
"Supported Input Shapes" is where that boundary is written down.
