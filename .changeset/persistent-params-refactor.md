---
"@real-router/persistent-params-plugin": patch
---

Refactor internals to align with browser-plugin architecture (#247)

- Extract `LOGGER_CONTEXT` and `ERROR_PREFIX` into `constants.ts`
- Move initialization (param parsing, Set/freeze) from closure to factory level
- Move side effects (`setRootPath`, `addInterceptor`) from `getPlugin()` to constructor with rollback on partial failure
- Simplify teardown: remove global try/catch, wrap only `setRootPath` (throws during `router.dispose()`)
- Remove duplicate `extractOwnParams` call from `mergeParams`
- Add typed noop pattern (`EMPTY_PLUGIN`) for empty config
- Fix `export { PersistentParamsConfig }` → `export type { PersistentParamsConfig }`
- Add unit tests for `extractOwnParams` and `mergeParams`
