---
"@real-router/core": patch
---

Accept the full `LoggerConfig` surface in `createRouter` options (#789)

`isLoggerConfig` rejected `level: "none"` and the `callbackIgnoresLevel` key, so `createRouter(routes, { logger: { level: "none" } })` and `createRouter(routes, { logger: { callbackIgnoresLevel: true, callback } })` — both documented in the wiki and supported by `@real-router/logger` — threw a `TypeError` from the constructor. The guard now accepts the complete `LoggerConfig` surface (`"none"` level plus `callbackIgnoresLevel`, validated as a boolean), aligning core with the logger package, the validation plugin, and the wiki. Widens accepted input; not breaking.
