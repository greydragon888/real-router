---
"@real-router/core": minor
---

An own `__proto__` key from an ordinary bag can no longer reach `state` (#1792)

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members,
so `target[key] = value` for that one name reaches the inherited setter: no own
key appears, the value is gone with no error and no log, and an OBJECT value
replaces the target's prototype instead. `Object.keys` and `JSON.stringify` stay
innocent while `state.search.anything` answers from the attacker's object.

**What is guaranteed.** A bag that is ORDINARY — plain data that does not change
while the router reads it — cannot put this key into `state.params` or
`state.search`. That is the case the rule exists for: a bag from `JSON.parse`,
from `history.state`, from a query string an app parsed itself.

**What is not, deliberately.** Nothing about a bag that CHANGES while the router
reads it — an accessor that rewrites its own object, a Proxy answering
differently per trap call. A router cannot defend an application against its own
code, and buying that case costs discipline at a dozen sites for a shape only the
caller can create. It belongs to whoever handed the bag over.

**The guarantee is held by the COPY SITES** — the places where core copies a
foreign bag into an object it owns: `normalizeParams`, both loops of
`mergeDefined`, `stripUndefined`, the copy `mergeWithDefault` freezes, and the
two commit doors (`navigateToState`, `systemCommit`). Each names the key
unconditionally, with no reachability argument: "it cannot get here" is a claim
about an object the router does not own, and two such claims have already been
wrong. Ownership is a sound reason to omit a guard; reachability is not.

⚑ **This is deliberately NOT a check at the entry points.** A door reads a bag
the router does not own and the copy happens later, so anything read twice can
differ in between. Three shapes defeat a door-side check and are pinned here: an
interceptor's bag that answers clean on one read and hostile on the next; a route
default the caller still holds a reference to and mutates after registration; and
a State handed to a commit door, which used to be committed by reference and
stayed writable through the caller's own handle.

⚠ **What a door still does NOT do.** The channel guard's own question — is a
declared query key riding in the path bag — is answered from a read that happens
before the copy, so a bag that changes between them can still pass the check and
commit the other value. That is the same "outside the guarantee" class above, and
it is not closed here.

⚠ **Observable changes for plugin authors.** `navigateToState` and
`systemCommit` no longer commit the exact object they were given — both channels
are frozen copies, so identity comparisons against the argument stop matching
(except for an empty bag, which still reuses the shared singleton), a write into
`getState().params` now throws in strict mode, and an `undefined`-valued own key
is stripped as it is by every other producer. Symbol-keyed entries are dropped
from both channels, where `navigateToState` previously kept them. And a
`__proto__` entry is dropped SILENTLY at this layer: the diagnostics that name
the writer are a separate change, so the seven wiki pages describing a
`TypeError` are being corrected alongside this one.
