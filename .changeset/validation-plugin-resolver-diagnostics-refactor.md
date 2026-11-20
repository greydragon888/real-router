---
"@real-router/validation-plugin": minor
---

The route resolver's three warnings move onto diagnostics (#2388)

The mode gate's dropped-query-key warning, the undeclared-params-key warning
and the codec round-trip warning are subscriptions to `DROPPED_QUERY_KEY`,
`UNDECLARED_PARAM_KEY` and `CODEC_ROUND_TRIP`, removed on `teardown`. Each
keeps its message and its de-dup per router.

The re-exported `RouterValidator` type declares no member; code typed against
its `state` namespace subscribes to the kinds instead, as `@real-router/core`
describes. While the plugin is installed, `getInternals(router).validator`
holds an object with no member: it marks the installation, so a second one on
the same router is still refused.

⚠ **A `console.warn` that throws on one of these warnings no longer escapes
the door.** The router logs the throw through `logger.error`, and the door
answers as it does without the warning. On a dropped query key that is
`buildPath`, `buildPathResolved`, `makeState`, `buildNavigationState`,
`matchPath`, `isActiveRoute` on the active route, `canNavigateTo`, `navigate`,
`navigateToDefault`, `start` and the revalidation of `RoutesApi.replace()`; on
an undeclared params key or a codec warning, `navigate`, `navigateToDefault`
and `buildNavigationState`. Previously the printers, the builders and
`matchPath` threw, the two predicates answered `false`, the navigations
rejected, and `replace()` threw and left the state on its old path. A setup
whose `console.error` throws as well still gets those answers, with the error
`console.error` threw when the router logged the warning's throw.
