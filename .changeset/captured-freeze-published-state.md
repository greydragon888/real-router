---
"@real-router/core": patch
---

fix: every freeze that owns a published guarantee reads a CAPTURED intrinsic (found by #1928, class of #1970 / #1971)

Three sites read `Object.freeze` off the mutable global at call time, so an
application that re-points it after boot silently defeated "states are deeply
frozen" — the mode gate's drop branch (`state.search` when a key is dropped) and
both producers that hand-build a transition meta (`state.transition` and its
`segments`, plus the `deactivated` array inside them).

Measured with the global neutered: `search`, `transition` and `segments` all came
back writable on a committed state, and 4759 tests stayed green — a freeze that
is a no-op changes no outcome, which is why the class is invisible to ordinary
coverage.

Found by walking the level ABOVE a capture that had just become load-bearing:
#1928 moved the `params` freeze onto `materialize`, and the question "where else
is this intrinsic read raw?" answered with these three. The existing capture pin
was green throughout, because its arc gets `search` from the channel merge, whose
freeze was already captured.
