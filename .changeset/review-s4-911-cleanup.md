---
"@real-router/core": minor
---

Remove dead `BuildStateResultWithSegments` type + internal cleanups (#911)

- **Breaking (type-only):** removed the unused public `BuildStateResultWithSegments` type — it had zero consumers across the monorepo despite its `@internal` "used internally" note.
- Renamed the internal logger-config guard `isLoggerConfig` → `assertLoggerConfig` with an `asserts config is LoggerConfig` signature: it validates-and-throws, so the `is`-predicate name was misleading.
- Documented the intentional module-global `transitionPath` caches (shared across routers, bounded by route-name vocabulary, not per-router so not cleared on dispose).
