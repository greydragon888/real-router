---
"@real-router/browser-plugin": minor
---

Remove `meta` from history state, remove `forceId` from popstate restoration (#202)

**Breaking Change:** `state.meta` is no longer written to `history.state` or restored on popstate. `forceId` no longer passed to `makeState`.

Existing history entries with `meta` are not affected — extra fields are ignored.
