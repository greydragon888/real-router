---
"@real-router/navigation-plugin": minor
---

A navigation the router refuses takes the browser back to the entry the router stands on, instead of rewriting the entry it reached (#2740)

**Breaking Change:** the Navigation API commits an intercepted navigation before the handler runs and does not undo it when the handler rejects. When the router refused — a `canDeactivate` or `canActivate` guard, any other `RouterError`, a crash inside the transition — the plugin wrote the router's URL into the entry the browser stood on, which is the destination. A refused Back from `[/home, /users/42]` left `[/users/42, /users/42]`: the page left behind was gone, replaced by a copy of the current page. A refused link to a route left a copy of the current page ahead of it, so Back from there repeated the page.

The plugin now calls `traverseTo()` with the key of the entry the router stands on — the one the navigation started from, or, for a navigation that cancels another the router was still taking, that one's origin:

- the return moves no entry — the page a refused Back or Forward left behind is still one step away;
- a refused push (a link, `location.assign()` or `navigation.navigate()` to a route) leaves its own entry one step ahead of the page, until the next push from there replaces it; until then `canGoForward()` is `true`, `peekForward()` returns the refused route, and the visit counts include it;
- a refused `replace` keeps its entry, and the plugin rewrites it as before; so does a recovery whose `traverseTo` throws;
- a navigation the router commits between the refusal and the recovery — a redirect a `TRANSITION_ERROR` listener queues — owns the URL, and nothing is written;
- the return is the plugin's own traversal and starts no transition.

A navigation to a URL no route matches recovers the same way. Under `allowNotFound: true`, a `navigateToNotFound()` the current route's `canDeactivate` refuses takes the browser back; under `allowNotFound: false`, `ROUTE_NOT_FOUND` does. Both left the URL where the navigation put it while the router stayed. A download that cancels a navigation the router is still taking returns too, and does nothing once the router has stopped or committed another navigation.

After a return the intercept rejects with the refusal, so `finished` of a refused navigation rejects with the router's error (`CANNOT_DEACTIVATE`, …) where it rejected with `AbortError`, and `navigateerror` carries it. A refused `replace` still rejects with `AbortError`. A handler that resolved would have the browser restore the scroll position of the entry it reached onto the page the router stayed on (measured on Chromium 153).

A page the router keeps refusing to enter — an authenticated one after logout — stays in history and turns Back away each time.

**Migration:** observe a refusal through `onTransitionError` or the router's `TRANSITION_ERROR` event. Code that matched `AbortError` on `finished` of a refused navigation sees the router's error instead.
