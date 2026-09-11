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
