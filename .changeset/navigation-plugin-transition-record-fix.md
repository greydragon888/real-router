---
"@real-router/navigation-plugin": patch
---

A navigation's record belongs to the transition it starts (#2754, #2753)

The plugin stages a record for the navigations that carry metadata — a browser
navigation, `traverseToLast()` and the document's `navigation.activation`: the
`state.context.navigation` metadata and, for `traverseToLast()`, the history
entry to traverse to. It kept one record for the whole router, and the hooks
that consumed and retired it could not tell which transition it belonged to,
so overlapping navigations took each other's:

- A navigation that superseded a `traverseToLast()` an async guard held
  consumed its record — Back, `navigation.navigate()`, `history.pushState()` to
  a URL with or without a route, `router.navigate()` — and so did a
  `router.navigate()` started from inside one of its guards. The router
  committed the newer route, and the browser traversed to the entry
  `traverseToLast()` was going to (#2754).
- A browser navigation that superseded a `router.navigate()` an async guard
  held lost its metadata to the superseded transition's cancel hook. Its guards
  read no `toState.context.navigation`, and the state published
  `navigationType: "replace"` and `direction: "unknown"` without the
  navigation's `info` (#2753).
- A browser navigation in flight published `"replace"` / `"unknown"` the same
  way when an unrelated router call was refused as `SAME_STATES` or
  `ROUTE_NOT_FOUND`; its guards had already read its metadata.

The transition a navigation starts now takes its record at its start, and that
transition's success publishes it and no other: the plugin finds a
transition's record by the `state.context` object the transition carries from
its start to its commit. A commit that starts no transition —
`navigateToNotFound()`, among others — takes the record of the browser
navigation whose router call makes it, and a transition that starts inside
that call takes none of it. A record no transition took is dropped when its
call returns, and a navigation nested in another's call leaves the outer
record in place.

The same change fixes three older arcs of the class:

- A navigation that a route's `canDeactivate` guard starts while the router
  checks a URL no route matches published that browser navigation's metadata.
- A commit made inside such a check — a navigation to a URL no route matches
  that the browser handles, or an app's own `navigateToNotFound()` — left the
  outer navigation with metadata derived from its options. An app's commit
  there publishes the outer navigation's metadata, as before.
- A refused navigation the browser handles inside `traverseToLast()`'s call
  replaced the traverse's metadata with its own.

Edge cases that change with it:

- A browser navigation that supersedes the start transition publishes its own
  metadata, not metadata derived from the transition's options.
- The `navigation.activation` metadata goes to the router's first transition or
  commit. A `start()` refused before it begins one — strict mode on a URL no
  route matches — leaves it to the next `start()`, and so does a
  `traverseToLast()` refused before the router starts. A plugin installed on a
  router whose `getState()` or `getPreviousState()` returns a state publishes
  none.

Not supported: starting a navigation from inside another navigation's router
call or from inside a router notification — from an abort handler of the
navigation that call supersedes, or by restarting the router with `stop()` and
`start()` from a listener. The navigation started there can take the other's
metadata, or leave it without its own. In some of these orders the previous
version published the right metadata: a `traverseToLast()` whose superseded
navigation's abort handler starts a navigation a guard holds, and a restart
from a listener of the transition `traverseToLast()` supersedes, now publish
`"push"` instead of traversing; a restart while a start on a URL no route
matches is announced now gives the activation to the restarted router instead
of that page.
