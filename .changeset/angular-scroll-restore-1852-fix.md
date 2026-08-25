---
"@real-router/angular": patch
---

Scroll restoration keeps its per-mount cache in a prototype-less record (#1852)

`createScrollRestoration`'s cache is keyed by `${route}:${json}`, a name the
page never chose, and it was both READ (the skip-same-value check) and WRITTEN
through a plain object — so both consulted `Object.prototype` under that name.
Structurally the same class as core's channel bags; practically the hardest to
reach, because the key always carries a colon and therefore cannot collide with
any of `Object.prototype`'s twelve members. That is a REACHABILITY argument, and
this repository has recorded twice that such arguments were wrong.

Closed with `Object.create(null)` rather than core's `putField`, and the split
is the point: core pays for the guarantee with a guarded write because its bags
are read on every render, while this is a small cache read a few times per
navigation, where the prototype-less form costs nothing measurable and needs no
primitive imported.

Part of #1901.
