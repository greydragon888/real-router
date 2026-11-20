---
"@real-router/core": minor
---

The route resolver reports through diagnostics, and `RouterValidator` declares no member (#2388)

Three new diagnostic kinds. `DROPPED_QUERY_KEY` (`[routeName, key]`) is a key
the mode gate drops from a route's query channel. `UNDECLARED_PARAM_KEY`
(`[routeName, key]`) is a key that is neither a path slot the route's URL
prints nor a query param the route declares, in the params `navigate`,
`navigateToDefault` or `buildNavigationState` builds a state from.
`CODEC_ROUND_TRIP` (`[state, codec, pathSlots]`) is a state those three build
on a route with a codec. Each kind is raised only while it has a listener;
without one, core walks no caller's bag for an undeclared key and looks up no
codec for the report.

`RouterValidator` loses its `state` namespace — `reportDroppedQueryKey`,
`reportUndeclaredParamKey` and `reportCodecRoundTrip` — and declares no member:
core asks nothing through `getInternals(router).validator`. A validator of your
own subscribes to the three kinds with `PluginApi.subscribeDiagnostic` instead.

⚠ **A report handler that throws no longer escapes the door.** The router logs
the throw through `logger.error`, and the door answers as it does without the
report. Previously the throw of the validator's report changed the answer:

- on a dropped query key, `buildPath`, `buildPathResolved`, `makeState`,
  `buildNavigationState` and `matchPath` threw it; `isActiveRoute` on the
  active route and `canNavigateTo` answered `false`; `navigate`,
  `navigateToDefault` and `start` rejected with it; and `RoutesApi.replace()`,
  revalidating a state that carries the key, threw it and left the state on its
  old path;
- on an undeclared params key or a codec report, `navigate` and
  `navigateToDefault` rejected with it and `buildNavigationState` threw it.

A setup whose `console.error` throws as well still gets those answers, with the
error `console.error` threw when the router logged the handler's throw.
