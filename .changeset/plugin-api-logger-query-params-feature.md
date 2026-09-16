---
"@real-router/core": minor
---

`PluginApi.logger` and `PluginApi.getDeclaredQueryNames` — two more members reach plugins without the internals door (#2339)

Second slice of retiring the published `getInternals`, and the last one that needs
no design decision: both members satisfy the membership rule recorded in
`packages/core/CLAUDE.md` — shipped code outside core reaches them, and each has a
signature the published types can already express (`RouterLogger` is exported from
`@real-router/core/types`; the other takes and returns primitives).

`logger` is published as a **frozen three-method view**, never the instance. The
class behind the interface also carries `configure`, and the instance is not
frozen — measured, a holder could re-aim this router's logging for every consumer
at once and replace `warn` for all of them, which is the #1805 hazard the frozen
surface exists to close. The view DELEGATES rather than copies, so a spy installed
on the logger afterwards is still seen; that is what the new cells assert.

`getDeclaredQueryNames` is the renamed member the migration plan asks for, and the
INTERNALS member is renamed with it. A differently-named pair is a drift surface by
construction, and the stub-seam authority's same-name rule exists to refuse exactly
the shape a one-sided rename would create. It ships with three hostile-input
vectors — a boxed name, a name the tree does not hold, and a prototype key.

Measured: shipped code outside core now reaches **four** internals members, down
from seven. What is left is exactly what cannot move without a decision — the two
stores, whose type no subpath publishes; the validator's write channel; and the
hydration scratchpad (#2361).

Two authorities gained a class, both derived and both narrower than the shape they
admit. The stub seam now accepts a call that reaches `ctx.<member>` THROUGH the
member (`ctx.logger.warn(…)`) — the same-name rule is untouched, so a member
rewired to a different internals method still fails it. The parity ledger gained a
VIEW class: a pair that is not identity-equal and takes no input, where what can
diverge is forwarding rather than an answer, and the cell asserts that instead.

⚠ The internals members stay for now. They cannot leave while `getPluginApi` reads
through the same bag, and the door itself is what a later slice removes.
