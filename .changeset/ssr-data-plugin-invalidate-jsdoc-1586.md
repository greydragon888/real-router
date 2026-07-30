---
"@real-router/ssr-data-plugin": patch
---

Correct the `invalidate` JSDoc reload example to the four-slot signature (#1586)

The "explicit await — pair with a same-route reload" snippet taught
`router.navigate(state.name, state.params, { reload: true })`. Slot 3 has been
the query channel since RFC-4 M2 (#1548), so that form puts `{ reload: true }`
in `search` — the reload never fires and the rebuilt URL loses the page's own
query.
