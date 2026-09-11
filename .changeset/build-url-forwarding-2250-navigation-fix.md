---
"@real-router/navigation-plugin": minor
---

`router.buildUrl` resolves `forwardTo` (#2250)

The shared builder behind this plugin's `buildUrl` asked `router.buildPath`,
which is the LITERAL form by record — it answers about the route it was NAMED.
A `<Link>` to a `forwardTo` source therefore rendered the source's URL while its
own click committed the target's, and the plugin rewrote the address bar right
after. It now builds from `buildNavigationState`, the same door
`replaceHistoryState` has taken since #1585. An unknown route still throws: the
`??` keeps `router.buildPath` as the failure shape.

⚠ **A second divergence closes with it.** The channel guard (#1572) has always
thrown on the click when a route's declared query name is handed in the PATH
bag; `router.buildPath` answers the literal path, so the URL this builder
produced was a working address for an intent that could not commit. Asking the
resolving door makes this builder throw there too — `<Link routeName="q"
routeParams={{ page: "2" }}>` on a route declaring `?page` now renders no href
instead of one its own click refuses. The fix is the same it always was: pass it
in `routeSearch`.
