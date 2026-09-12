---
"@real-router/core": patch
---

`systemCommit` refuses a route name the table does not hold (#2252)

`RouterInternals.systemCommit` and `RouterInternals.navigateToState` both take a
caller-supplied `State`, and the tracked door register groups them as one
mechanism — but only `navigateToState` checked that the route exists.
`systemCommit` published whatever it was handed, so `getState().name` could
become an object, a number, `undefined`, or a string the table never held. Every
consumer downstream — `isActiveRoute`, the adapters' active-link comparison, the
segment walk's `name.split(".")` — is typed against `string`.

It is reachable: `getInternals` ships from `@real-router/core/validation`, and
`systemCommit` is how a URL plugin publishes a state built from the address bar,
so a `history.state` entry deserialised from an older build — or written by
another app on the same origin — arrives in exactly that shape.

The same existence check `navigateToState` makes now guards it, with the same
`UNKNOWN_ROUTE` carve-out, since that is `navigateToNotFound`'s own output shape.

⚠ The predicate is EXISTENCE, not "the name is a string": the issue reported an
object, and a number, an absent slot and an unknown string were committed too.
One check refuses the four.

⚠ It THROWS where the sibling rejects. That is not the asymmetry `internals.ts`
records for `navigateToState`: this member returns a `State` synchronously and
has no promise to reject.
