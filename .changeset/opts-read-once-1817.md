---
"@real-router/core": minor
---

`executeNavigation` reads each `opts` flag once (#1817)

#1719 hoisted the navigation meta's flags at the entry, on the stated ground that
`opts` is accessor- or Proxy-backed by contract and every read is a call into
application code. Two readers stayed behind, and each is a place where the value
that DECIDED and the value RECORDED in `state.transition` were different reads of
the caller's object:

- `isSameNavigation` re-read `opts.reload` (and read `opts.force`) to decide the
  `SAME_STATES` short-circuit;
- `forceReplaceFromUnknown`'s predicate read `opts.replace` before the hoist did.

Both now take the hoisted values. Measured on a `reload` answering `true` then
`false`, navigating to the route already committed: the reload used to be refused
as `SAME_STATES`; the mirror direction used to navigate while recording
`transition.reload: false`. Out of `UNKNOWN_ROUTE`, a `replace` answering `true`
then `false` used to commit `transition.replace: false` — losing the forced
replace whose whole purpose is keeping 404 entries out of the history.

⚠ **This is not a hardening change.** Making two reads disagree needs a getter
that answers differently between them, and the accessor-backed bags that occur in
practice — Vue's `reactive()`, Svelte 5's `$props()` — are pass-through and
stable. What it does is finish a rule the codebase already states about itself.

⚠ **`force` moves from a lazy read to an unconditional one.** `isSameNavigation`'s
`&&` short-circuited, so it was reached only when a `fromState` existed and
`reload` was falsy. The total reads per navigation are never higher (4 → 4, and
6 → 4 out of `UNKNOWN_ROUTE`), but the distribution changes.

Nothing else moves: `state.transition`'s shape is identical for every option
shape measured, including non-boolean `replace` values, which pass through
unchanged.
