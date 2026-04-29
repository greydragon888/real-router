---
"@real-router/browser-plugin": minor
---

Add URL fragment ("hash") support via `state.context.url` (#532)

The plugin claims the shared `"url"` `state.context` namespace alongside its
existing `"browser"` namespace. Subscribers can read the decoded fragment and
the `hashChanged` signal from `state.context.url`.

- `router.buildUrl(name, params, { hash })` and
  `router.replaceHistoryState(name, params, { hash })` accept an options object
  with the decoded fragment.
- `router.navigate(name, params, { hash })` exposes tri-state `hash`:
  `undefined` preserves, `""` clears, a non-empty value sets the fragment.
- The popstate handler samples `location.hash` after the browser has updated
  to the destination, detects hash-only navigation, and adds
  `force: true, hashChange: true` to bypass SAME_STATES.
- Cross-path navigation preserves the current fragment by default; the
  previous `shouldPreserveHash` workaround that dropped the hash on path
  change is removed.
- `rollbackUrlToCurrentState` (popstate recovery) reads the fragment from
  `state.context.url.hash` so guard rejection or unmatched URLs do not strip
  the fragment.
