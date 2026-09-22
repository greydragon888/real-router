---
"@real-router/core": patch
---

A `$$error` listener can no longer write into the refusal the caller catches (#2509)

`navigateToNotFound` reported its `canDeactivate` refusal to listeners and froze
the same object afterwards, so every `$$error` listener held a window in which a
write landed in what the application then caught. Measured: at the listener
`Object.isFrozen` was `false` and a write was accepted; the caller then received
the frozen error **carrying that write**. The refusal is now frozen before the
report, matching its three siblings in `NavigationNamespace`.

⚠ **A listener that wrote to this error will stop having an effect** — silently in
sloppy mode, with a `TypeError` in strict mode. The report still precedes the
throw, which is the ordering that site's own comment defends; only the freeze
moved ahead of it.

⚑ Fourth of a family: #1960 removed the frozen/unfrozen asymmetry in core, #1964
in three plugin sites, #2503 where construction moved into a helper. This one is
the sharpest, because the window was handed to a third party rather than kept
inside the router. The guard is a second observation point on the property
`prefixless-refusal-doors-2459` already watches at the caller — what a listener
receives — and it reds on this defect alone.
