---
"@real-router/core": patch
---

Dissolve `@real-router/logger` into core as a per-router `RouterLogger`

The standalone `@real-router/logger` package has been folded into `@real-router/core`
(`core/src/foundation/logger/`). The former process-global **singleton** logger is
replaced by a **per-router `RouterLogger` instance**, built from `options.logger` in the
`Router` constructor and stored on the router's internal context. So
`createRouter(routes, { logger })` now configures **only that router's** logger and its
`configure()` no longer leaks across routers (previously the last `createRouter` /
`cloneRouter` in the process won). The public API is unchanged — the `options.logger`
shape and the `log` / `warn` / `error` / callback semantics are identical, and
`RouterLogger` still writes to `console`.

The `@real-router/logger` package is deleted and is no longer a (transitive) dependency of
`@real-router/core`. The logger contract types (`RouterLogger`, `LoggerConfig`, `LogLevel`,
`LogLevelConfig`, `LogCallback`) now live in `@real-router/types` and are re-exported from
`@real-router/core`.
