---
"@real-router/browser-plugin": minor
---

Remove `meta.options` from history state and popstate restoration (#202)

**Breaking Change:** `state.meta.options` is no longer written to `history.state` or restored on popstate.

Existing history entries with `meta.options` are not affected — extra fields are ignored on spread.
