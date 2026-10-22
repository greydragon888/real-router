---
"@real-router/hash-plugin": patch
---

A Back, a Forward or an external fragment change that a newer router navigation cancels waits for that navigation's end (#2802)

- While a guard held the traversal, a router navigation that superseded it was taken to own the URL at the cancel, and the entry the browser had reached was rewritten with the router's URL then. A newer navigation refused afterwards left the page the traversal was for gone from history; one that committed pushed after the rewritten entry.
- Now that navigation's end decides. One that commits writes its entry after the entry the traversal reached: a push keeps that entry's page, a replace overwrites it. One that is refused, or cancelled with nothing newer behind it, takes the browser back to the entry the traversal started from, as a refused traversal does (#2740, #2796). A `navigate()` that a `TRANSITION_CANCEL` listener registered before the traversal began starts in a microtask after a guard cancels the traversal quietly is waited for the same way: when a guard refuses it at once, a redirect a listener of that refusal starts in a microtask owns the URL, where the traversal returned first. An entry an external fragment change created carries no position, so there the plugin rewrites it with the router's URL, as for a refused fragment change.
- Nothing is written while it runs. A traversal meanwhile is decided in its place, and `stop()` or removing the plugin drops the wait.
- The plugin's watch over newer navigations takes a `TRANSITION_SUCCESS` listener for each traversal as well. A router whose `limits.maxListeners` (10,000 by default) leaves no room on start, success, error or cancel refuses the watch, and a cancelled traversal then rewrites the entry the browser stands on, a guard's quiet cancel included — as when the limit refused the watch before.
