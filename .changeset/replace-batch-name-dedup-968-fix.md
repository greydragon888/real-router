---
"@real-router/core": patch
---

Reject duplicate route names within a single `replace()` batch (#968)

`getRoutesApi(router).replace([...])` now throws `[router.addRoute] Duplicate route "<name>" in batch` when two routes in the new set resolve to the same full name, instead of silently keeping the last and dropping the first (parallel to the `add()` fix in #953). The check runs before the tree is built or swapped, so a rejected `replace()` leaves the existing routes intact (atomic). The `addRoute` method label matches `@real-router/validation-plugin`, which already reports `addRoute` for replace batches — so the error is identical with or without the plugin.
