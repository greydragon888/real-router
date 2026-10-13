---
"@real-router/navigation-plugin": patch
---

A navigation the browser makes to a URL the router rewrites leaves no extra history entry and no stale URL (#2744)

The browser commits the entry of a link, `navigation.navigate()`, `location.assign()` or `history.pushState()` before the router runs. When the router lands on another URL — a `forwardTo` source, a trailing slash `trailingSlash: "never"` strips, a query `defaultSearch` adds — the plugin left that entry as it was:

- From another route, it pushed the router's URL on top, and the navigation left two entries. The first Back landed on the browser's entry, the router answered `SAME_STATES`, and the page did not change.
- On the route the router already shows, it wrote nothing, and the address bar kept the URL the browser was given — after a push, a replace, or a Back or Forward onto such an entry.

The plugin now rewrites the entry the browser committed:

- The write picks push or replace with `shouldReplaceHistory`, as browser-plugin and hash-plugin do, and a navigation the browser started carries `replace: true`. An explicit `replace: false` on the first navigation pushes. `state.context.navigation.navigationType` still reports `"push"` for a push.
- On `SAME_STATES` the plugin gives an entry at another path or query the router's URL, as the History API plugins do. A fragment that changes on the router's own URL, as a third party's `history.replaceState` changes it, is left as it is.
- A link to another URL of the route the router shows, with another fragment than the published one, runs a transition, as a fragment-only link does, and publishes that fragment.
- The URL a recovery writes is the router state's own path, so it keeps a trailing slash `trailingSlash: "preserve"` keeps.

A link to another URL of the page the router already shows leaves two entries at the router's URL, as under hash-plugin. The plugin's write ends the browser's navigation, so the browser does not scroll after it, as after any link the router rewrites.
