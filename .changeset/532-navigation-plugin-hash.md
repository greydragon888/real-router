---
"@real-router/navigation-plugin": minor
---

Add URL fragment ("hash") support via `state.context.url` (#532)

The plugin now publishes a shared `url` namespace under `state.context` containing
the decoded fragment and a `hashChanged` signal. Subscribers can branch on
`state.context.url.hashChanged` instead of disambiguating via the overloaded
`force` flag.

- `router.buildUrl(name, params, { hash })` accepts an options object with the
  decoded fragment (no leading `#`).
- `router.replaceHistoryState(name, params, { hash })` mirrors the same widening.
- `router.navigate(name, params, { hash })` exposes a tri-state `hash` option:
  `undefined` preserves the current fragment, `""` clears it, a non-empty value
  sets it.
- The `navigate` event handler detects `event.hashChange` and forwards
  `force: true, hashChange: true` so same-path hash-only clicks are not swallowed
  by the SAME_STATES short-circuit.
- Cross-path navigation now preserves the current fragment by default, fixing
  the previous `shouldPreserveHash` workaround which dropped the hash on every
  path change.
- Recovery (`syncUrlToRouterState`) reads the fragment from
  `state.context.url.hash` so guard rejection or unmatched URLs do not strip the
  fragment from the visible URL.
