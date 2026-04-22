---
"@real-router/hash-plugin": patch
---

Internal refactors: filter explicit `undefined` option values and remove `router.buildUrl` indirection

- **Bug fix**: `hashPluginFactory({ hashPrefix: undefined })` now correctly falls back to the default `""` instead of producing `urlPrefix: "#undefined"`. Previously, explicit `undefined` values leaked through `{ ...defaults, ...opts }` spread because `undefined` is a legitimate enumerable own property.
- **Refactor**: the popstate-handler `buildUrl` callback now uses the pre-computed `pluginBuildUrl` closure directly instead of going through `router.buildUrl(name, params)` wrapper (removes one level of indirection on the error-recovery path).
- **Refactor**: `loggerContext` in `createPopstateHandler` now references the `LOGGER_CONTEXT` constant from `src/constants.ts` instead of a duplicated string literal.

No public API changes.
