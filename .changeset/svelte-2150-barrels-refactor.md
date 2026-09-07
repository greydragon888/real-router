---
"@real-router/svelte": patch
---

Drop dead type re-exports from the shared dom-utils barrel (#2150)

Internal refactor with no published API change: `shared/dom-utils/index.ts`
re-exported `ResolvedLinkTarget`, `ScrollRestorationMode`, `DirectionTracker`
and `ViewTransitions`, which every consumer already imports from the module
that declares them.
