---
"@real-router/search-schema-plugin": minor
---

The plugin logs through the router's logger instead of `console` (#2975)

The plugin's messages go to the router's logger, under the context
`search-schema-plugin`: in `mode: "development"` without `onError`, the report
of rejected search params and the error of a schema that answers a search with
a rejected Promise as `logger.error`, and in `mode: "development"`, both
findings of the `defaultSearch` check as `logger.warn`. The router's `logger`
option — its `level` and its `callback` — applies to them. With the default
logger the console shows the same lines as before.

**Breaking Change:** the messages no longer reach `console` under a `level`
that filters them — `"none"`, and `"error-only"` for the two `defaultSearch`
warnings. To keep them under such a level, read them in the router's
`logger.callback` with `callbackIgnoresLevel: true`: it receives each under the
context `search-schema-plugin`, without the `[search-schema-plugin]` head the
console prints.
