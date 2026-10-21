---
"@real-router/hash-plugin": patch
---

A Back or Forward a guard cancels quietly returns to the entry it started from (#2796)

A guard can cancel a navigation quietly: throw or reject with `RouterError(TRANSITION_CANCELLED)`, or throw an `AbortError`. When it does so on a browser traversal, with no newer navigation behind the cancel, the router stays where it was, and the plugin now takes the browser back to the entry the traversal started from with `history.go()`, as it does for a refused one. Before, it rewrote the entry the traversal reached with the router's URL: the page the Back was for vanished from history, and the next allowed Back skipped past it.
