---
"@real-router/core": minor
---

Give `buildNavigationState` a `search?` slot (#1571)

`getPluginApi().buildNavigationState(name, params)` was the ONE pipeline entry
point that could not express a query intent — `navigate`, `buildPath`,
`canNavigateTo`, `isActiveRoute` and `makeState` all take a query channel
(verified individually). A caller could only reach `state.search` by riding
declared keys in the `params` bag, which is exactly the shape the always-on
channel guard is meant to reject.

```ts
buildNavigationState(name, params?, search?)   // third slot, additive
```

The argument flows THROUGH the `forwardState` seam rather than past it, so it
picks up the same semantics the other five have: an explicit value beats a
declared twin the caller rode in `params`, and a `search-schema` interceptor
sees the query channel. Left undefined it stays undefined — the frozen
empty-search singleton is applied downstream, so the two-argument form allocates
exactly as before.

Purely additive: every existing two-argument call keeps its behaviour. Measured
acceptance — the one-call form now reproduces, byte for byte, the double-call
workaround its only consumer (`shared/browser-env`'s `createReplaceHistoryState`)
uses today, across a plain intent, a params-bag twin, a `defaultSearch` route, a
`forwardTo` resolution and an empty bag. Dropping that workaround is its own
step (#1574).
