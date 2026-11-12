---
"@real-router/validation-plugin": patch
---

Refuse a `usePlugin` batch that would pass `maxPlugins` (#2413)

The limit counted every call as one plugin, so `usePlugin(a, b, c, d)` on a router
at `maxPlugins: 3` registered all four. A call is now counted by the distinct
factories it carries — a factory repeated in it counts once — and a batch past the
limit throws the same `RangeError` a single registration does, naming what the
batch would add (`Current: 1, Attempting to add: 4.`), before any of its factories
runs. `maxPlugins: 0` still means no limit.

The count comes from `@real-router/core`'s new `validatePluginLimit` signature, so
this release needs the core release that ships with it.
