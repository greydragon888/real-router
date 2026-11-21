---
"@real-router/validation-plugin": minor
---

The query-key warnings respect the router's `logger` option (#2975)

The warnings about a query key the `queryParamsMode` drops, a param the route
declares nowhere, and a declared query param given in the `params` bag were
written to `console.warn` directly, past the router's `logger` option. They go
to the router's `logger.warn` under the context `router`, as the codec
round-trip warning does, so `level` and `callback` apply to them. With the
default logger the console shows the same lines as before.

**Breaking Change:** the warnings no longer reach `console` under
`level: "error-only"` or `"none"`. To keep them under such a level, read them in
the router's `logger.callback` with `callbackIgnoresLevel: true`: it receives
each under the context `router`, without the `[router]` head the console
prints.
