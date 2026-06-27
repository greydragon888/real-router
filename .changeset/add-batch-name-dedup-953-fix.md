---
"@real-router/core": patch
---

Reject duplicate route names within a single `add()` batch (#953)

`getRoutesApi(router).add([...])` now throws `[router.addRoute] Duplicate route "<name>" in batch` when two routes in the same call resolve to the same full name, instead of silently keeping the last one and dropping the first (whose path became unreachable via `matchPath`). This closes the within-batch gap left by the existing `assertAddable` guard, which only checked names against the already-registered tree. The guard runs before any tree/config swap, so a rejected batch leaves the store untouched (atomic). Mirrors the message `@real-router/validation-plugin` already produces, so the error is identical with or without the plugin installed.
