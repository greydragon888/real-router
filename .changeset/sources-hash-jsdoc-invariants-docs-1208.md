---
"@real-router/sources": patch
---

Docs: correct `hash: ""` active-state semantics in `ActiveRouteSourceOptions` JSDoc + sync package docs (#1208)

The `ActiveRouteSourceOptions.hash` JSDoc — which ships into `.d.ts` and IDE tooltips — mis-stated the no-URL-plugin case. Under hash-plugin / memory-plugin the source collapses the missing `context.url` namespace to `""`, so a **non-empty** `hash` is always `false` while `hash: ""` still matches an active route ("no namespace" reads as "no fragment", #532). Corrected the tooltip JSDoc (and the CLAUDE.md / README.md twins). No behavior change — this aligns the docs with existing, probe-verified behavior.

Also synced the repo docs with the current suite: added the reconnect-reconcile / lazy-connection / catch-up invariants (#765/#766) to INVARIANTS.md with corrected Test Files counters (routeSource 22, activeRouteSource 19, createDismissableError 7), fixed the ARCHITECTURE.md reconnect-reconcile credit + 5-component cache key, and documented the public `primeErrorSource` export (with the "errors before the first subscriber surface on the promise, not the source" limitation, #1215) in README.
