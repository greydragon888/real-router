---
"@real-router/hash-plugin": minor
---

Document URL fragment limitation with one-time runtime warning (#532)

`hash-plugin` uses `#` as the route delimiter, so URL fragments are
structurally incompatible. The plugin now accepts the `hash` option on
`buildUrl` / `navigate` for typing parity with `@real-router/browser-plugin`
and `@real-router/navigation-plugin`, ignores it at runtime, and emits a
single `console.warn` the first time any consumer surfaces a hash through
either entry point.

Use `@real-router/browser-plugin` or `@real-router/navigation-plugin` if you
need URL fragment support.
