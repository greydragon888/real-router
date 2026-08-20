---
"@real-router/core": minor
---

An own `__proto__` key can no longer reach `state`, whatever the caller does (#1792)

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members,
so `target[key] = value` for that one name reaches the inherited setter: no own
key appears, the value is gone with no error and no log, and an OBJECT value
replaces the target's prototype instead. `Object.keys` and `JSON.stringify` stay
innocent while `state.search.anything` answers from the attacker's object.

**The guarantee now lives at the copy sites** — the handful of places where core
copies a foreign bag into an object it owns: `normalizeParams`, both loops of
`mergeDefined`, `stripUndefined`, and the state `navigateToState` commits. None
of them carries that name, and none of them lets it swap a prototype.

⚑ **This is deliberately NOT a check at the entry points.** A door reads a bag the
router does not own, and the copy happens later — so anything read twice can
differ in between. Three shapes defeat a door-side check and are pinned as tests
here: an interceptor whose bag answers clean on the first read and hostile on the
second; a route default the caller still holds a live reference to and mutates
after registration; and a State handed to `navigateToState`, which used to be
committed by reference and stayed writable through the caller's own handle.

Also in this change: the `forwardState` seam reads each slot of the chain's result
ONCE, into a local, so the channel check can no longer vouch for a value that
never ships; and `navigateToState` commits its own frozen copies of both channels
rather than the caller's objects.

⚠ Two observable changes for plugin authors. `navigateToState` no longer commits
the exact object it was given — `getState().search` is a frozen copy, so identity
comparisons against the argument stop matching. And a `__proto__` entry in a bag
is dropped silently at this layer; the diagnostics that name the writer are a
separate, later change.
