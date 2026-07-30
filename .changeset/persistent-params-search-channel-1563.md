---
"@real-router/persistent-params-plugin": minor
---

Inject persistent values into the search channel, not the params bag (#1563)

The plugin declares its keys as query params (`setRootPath("?a&b")`) but wrote
their values into the path bag, leaving core to route them back. Both
interceptors now write the query channel only, so the plugin is channel-correct
by construction (RFC-4 M2 / #1548) and the path bag it is handed passes through
untouched.

- `forwardState` injects into `result.search`; a removal marker
  (`{ key: undefined }`) is now honored in **either** channel — previously
  `navigate(name, {}, { key: undefined })` left the key on the built URL.
- `buildPath` injects into `search` on both call shapes. With no explicit
  `search` the caller's params bag is the query source core would read
  (`search ?? params`), so its content is routed through `search` — which also
  fixes a route declaring `defaultSearch` swallowing the injection entirely
  (`buildPath` disagreed with what `navigate` commits).
- A caller value still wins over the stored one in either channel, and a tracked
  key passed in the path bag alone keeps the caller's value.
- **Breaking edge:** a persistent key that also names a **path slot** on the
  target route (`/x/:lang` with a persisted `lang`) no longer fills that slot —
  the value belongs to the query channel, so `buildPath`/`navigate` now throw
  `Missing required param` unless the caller supplies it.
