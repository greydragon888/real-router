---
"@real-router/angular": patch
---

Scroll restoration survives a committed state with no `transition` (#1976)

Core's commit door commits a foreign State's **absent** `transition` rather than
fabricating one (#1792), so the `router.subscribe` callback can be handed a
committed state without the field. Both flat reads in `scroll-restore` threw
there; absent now falls through to the plugin arm, the answer a state carrying
no meta got before.
