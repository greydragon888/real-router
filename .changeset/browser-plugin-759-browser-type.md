---
"@real-router/browser-plugin": minor
---

`Browser` interface now includes `addHashChangeListener` (#759)

The shared `Browser` type exported from browser-plugin gains an `addHashChangeListener` method, added so hash-plugin can track external URL fragment changes. browser-plugin's own runtime behavior is unchanged — it registers only a `popstate` listener, never `hashchange`. Code that supplies a hand-written `Browser` via the (test-only) `browser` factory argument must add this method.
