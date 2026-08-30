---
"@real-router/sources": patch
---

`createRouteEnterGate` survives a committed state with no `transition` (#1976)

Core's commit door commits a foreign State's **absent** `transition` rather than
fabricating one (#1792), so `router.subscribe` can hand this gate a committed
state without the field. The flat `route.transition.from` read threw there.

Absent now answers the same as an absent `from`: no origin known, skip.
