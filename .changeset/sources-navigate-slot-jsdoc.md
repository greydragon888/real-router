---
"@real-router/sources": patch
---

Correct the `stabilizeState` JSDoc reload example to the four-slot signature (#1548)

The doc named `router.navigate(name, params, { reload: true })` as the canonical
pairing for `invalidate(router, namespace)`. Slot 3 has been the query channel
since RFC-4 M2, so that spelling puts `{ reload: true }` in `search` — the
reload never fires and the rebuilt URL loses the page's own query.
