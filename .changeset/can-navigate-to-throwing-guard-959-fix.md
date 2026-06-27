---
"@real-router/core": patch
---

Log a warning when a sync guard throws in `canNavigateTo` (#959)

A guard that threw inside `canNavigateTo` was caught and converted to `false` with no log, event, or re-throw — a crashed guard was indistinguishable from one that legitimately blocked the navigation. `navigate()` surfaces the same throw via `handleGuardError` → `TRANSITION_ERROR`, but the synchronous predicate has no error channel, so core now logs the throw directly via `logger.warn` (an operational signal, distinct from the opt-in `@real-router/validation-plugin` DX warnings) before returning `false`.
