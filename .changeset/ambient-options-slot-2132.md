---
"@real-router/core": patch
---

A navigation option the caller never supplied no longer reaches the navigation (#2132)

Every slot of `NavigationOptions` core reads was read with a plain `[[Get]]`, so
an ambient `Object.prototype.signal` — or `.reload`, `.force`, `.replace`,
`.redirected`, `.forceDeactivate` — answered as if it had been passed. Measured
on all six:

| ambient key | before | after |
| --- | --- | --- |
| `signal` (aborted) | `start()` rejects `CANCELLED` | starts |
| `reload` / `force` | a repeat navigation succeeds | still `SAME_STATES` |
| `forceDeactivate` | a route's `canDeactivate: false` is ignored | still `CANNOT_DEACTIVATE` |
| `replace` / `redirected` | recorded in `state.transition` | not recorded |

It reached core's OWN objects too: with no options at all the facade substitutes
the frozen `EMPTY_OPTS` singleton, so core cancelled its own boot with an option
nobody supplied.

The rule itself is not new — `NavigationOptions` on the wiki has stated "only own
enumerable keys are read … the prototype chain is not supported input" since
#1962 (2026-08-30), the change that introduced the entry-door copy. That copy DID
take own keys only; what defeated the rule was reading the flags back off it with
a plain `[[Get]]`, because the copy had `Object.prototype` on its chain. Taking
own keys is half of it, and the half that was implemented.

Each of the six reads is now gated with `Object.hasOwn` — five inline at the
entry, `signal` in a small `ownSignal` helper because it is read above the copy.
Nothing about the object handed to plugins changes.

⚑ The structural alternative was written, measured and reversed, and the number
is recorded in INVARIANTS so the next attempt starts from it: making `EMPTY_OPTS`
and the copy `Object.create(null)`-based closes the class by construction — no
chain to answer from, and a read added later inherits the guarantee — but it puts
both objects in V8's dictionary mode, where every downstream read of the bag
becomes a hash lookup. Alternating-process A/B on the shape of
`navigate/external-signal`: **+39.6 %** per navigation on the path that copies,
**+7.6 %** on the one that does not. The gates cost **+3.0 %** / **+2.9 %**.
