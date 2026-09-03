---
"@real-router/core": patch
---

The `hasInflight` retirement is argued from the edges that actually exist (#1669)

The note said `inflight` is "written by exactly one `update`
(`beginNavigation`, on the only edges that ENTER the band)", and concluded that
outside the band it is never defined. Three of those are wrong against the
table: three updates write the field, `beginNavigation` sits on three edges of
which two already start inside the band, and `CANCEL` deliberately carries no
`update` — so the field outlives the band on purpose, which the paragraph
directly above says and the cancellation tests depend on.

The conclusion stands and now rests on what holds: both `CANCEL` edges start
inside the band, the one way in from outside carries `beginNavigation`, and the
two clearing updates sit on edges that leave. The predicate is asked only where
its answer is settled.
