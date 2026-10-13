---
"@real-router/browser-plugin": minor
---

A Back or Forward the router refuses takes the browser back to the entry it started from, instead of rewriting the entry it reached (#2740)

**Breaking Change:** `popstate` fires after the browser has moved. When the router refused the traversal — a `canDeactivate` or `canActivate` guard, `ROUTE_NOT_FOUND` under `allowNotFound: false`, a crash inside the transition — the plugin wrote the router's state into the entry the browser had moved to. A refused Back from `[/home, /users/42]` left `[/users/42, /users/42]`: the page left behind was gone, replaced by a copy of the current page.

The plugin now calls `history.go()` with the distance back to the entry the traversal started from. Every entry stays where it was, and the return starts no transition. A second Back pressed while a guard decides is dropped with the first. A navigation the router commits between the refusal and the recovery — a redirect a `TRANSITION_ERROR` listener queues — owns the URL, and nothing is written. A traversal that lands anywhere but the entry the return was sent to is taken as a traversal of its own.

The History API names no entry, so the plugin numbers the entries it writes: every `history.state` it writes carries `position: { run, index }` beside `name`, `params`, `search` and `path`. Where the distance cannot be measured, the plugin rewrites the entry the browser stands on, as before — an entry the browser or other code wrote breaks the numbering, and a custom `Browser` without `go` or `getState`, or whose `go` throws, cannot travel. `SAME_STATES` and `TRANSITION_CANCELLED` refuse nothing, and keep that rewrite. A Back or Forward the router takes onto an entry without a `position` writes the entry even when nothing else about it changed, so that it gets one.

A page the router keeps refusing to enter — an authenticated one after logout — stays in history and turns Back away each time.

The `Browser` type gains an optional `go(delta)`, which the built-in browser implements.

**Migration:** code that writes `history.state` on an entry the plugin wrote should keep the `position` member it finds there. A custom `Browser` gets the return by implementing `go` and `getState`.
