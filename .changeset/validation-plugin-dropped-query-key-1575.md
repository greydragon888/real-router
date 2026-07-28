---
"@real-router/validation-plugin": minor
---

Report a query key the active `queryParamsMode` drops (#1575)

Core's mode gate is always-on and SILENT: a query key the active
`queryParamsMode` will not print never enters `state.search`, so the two
channels of one state can no longer disagree. The drop is correct, and
invisible — which is exactly the always-on-fixes / opt-in-diagnoses split the
channel guard already follows.

New `state.reportDroppedQueryKey` hook, called by core from the drop itself (so
the report can never disagree with what was actually dropped) and de-duplicated
per route+key — the gate runs on every navigation and every `matchPath`, so an
un-deduped warning would flood a dev console the moment a route is revisited.

One message covers both ways to hit it, because core cannot tell them apart at
the drop and a guess would be worse than the plain fact:

- a caller passing a key the route never declared with `?name`;
- a `defaultSearch` entry for such a key — **dead config** under `default` /
  `strict`, since the default is dropped along with the key. This is the side
  edge worth naming out loud: nothing the caller wrote is wrong, the route
  config simply cannot take effect.

Warn, never throw: `queryParamsMode` is a serialization option, not an error
policy — promoting it to one would give three behaviours for a single rule.
