---
"@real-router/navigation-plugin": patch
---

A browser navigation a guard cancels quietly returns to the entry it started from (#2796)

A guard can cancel a navigation quietly: throw or reject with `RouterError(TRANSITION_CANCELLED)`, or throw an `AbortError`. When it does so on a navigation the browser started — a Back, for one — with no newer navigation behind the cancel, the router stays where it was, and the plugin now takes the browser back to the entry the navigation started from, as it does for a refused one. Before, the URL stayed on the entry the navigation reached while the router stayed on the page it was on.

- A newer navigation the browser starts, a download, or a router navigation that is neither refused nor cancelled owns the URL, and the plugin leaves it — as before.
- A router navigation that cancels the browser's and is refused before the plugin recovers leaves nothing that owns the URL, and the browser's navigation returns as well.
