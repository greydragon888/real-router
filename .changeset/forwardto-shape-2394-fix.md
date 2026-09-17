---
"@real-router/core": patch
---

A `forwardTo` must be a string or a function at every registration door (#2394)

`createRouter`, `add`, `replace` and `update` refuse a `forwardTo` that is neither
a target name nor a callback — a number, an object, `true`, an array, a `Symbol` —
with `TypeError: forwardTo must be a string or function for route "<name>", got
<type>`. Such a value is otherwise stored as a callback, and the first read of the
route fails far from its cause with `TypeError: startFn is not a function`, which
names neither the route nor the field: `matchPath` and `forwardState` throw it,
and `navigate` and `start` on that URL reject with it.

Core still drops a falsy value (`0`, `false`, `NaN`, `""`) rather than refusing
it, and `update(name, { forwardTo: null })` still removes the forward.

The refusal happens at construction, so a route config carrying such a value
fails in `createRouter` even when that route is never read. With
`@real-router/validation-plugin` installed before `add`, `replace` or `update`,
the plugin's own refusal comes first; a value declared in `createRouter` is
refused by core, before the plugin's pass at `usePlugin` runs.
