---
"@real-router/hash-plugin": minor
---

A navigation that commits while a refused Back or Forward returns stands (#2879)

When a newer navigation that cancelled a Back was refused, the plugin sent the Back's return before that navigation's own `.catch()` or `await` ran. A `replace` redirect from there went onto the entry the browser was leaving, and the return then took the router off it, with the redirect's page left behind in history. A regression of #2802. A `replace` that committed while any return travelled met the same end.

- A traversal a newer navigation cancelled is decided a task after that navigation's end, where it was a microtask, when the plugin is already waiting for it. A redirect the application commits in reaction to that end within that task — from a `.catch()`, an `await`, a listener's `setTimeout(0)` — owns the URL, and the browser is not sent back. A test on fake timers has to run them to see the return.
- A navigation that commits while the return travels, one behind an async guard of its own included, stands on the router and in the URL. Its write waits for the landing: a replace takes the place of the entry the traversal started from, and a push comes after it, so that entry stays one Back away. When the browser ignores `history.go()`, the writes go onto the entry it stands on after about a second. `replaceHistoryState()` waits the same way.
- A Back or Forward that lands elsewhere meanwhile is decided as a traversal of its own, and the waiting writes are dropped, as `stop()` and removing the plugin drop them.
- A waiting write that throws no longer reaches its caller: it is reported with `console.error`, which the router's `logger` option does not silence, and the other writes run.

**Breaking Change:** while the return travels, the history entry the plugin writes in `onTransitionSuccess` waits for the landing. Until then `location.hash` and `history.state` lag `router.getState()` — after `await navigate()`, in `router.subscribe` and in the hooks of plugins registered after this one.

**Migration:** code that reads where the router stands from `location.hash` or `history.state` right after a commit reads `router.getState()` instead, and `router.buildUrl()` for the hash URL.
