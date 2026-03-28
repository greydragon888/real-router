---
"@real-router/sources": minor
---

Add `createErrorSource` factory for navigation error tracking (#366)

New eager-subscription source that tracks `TRANSITION_ERROR` events. Provides `RouterErrorSnapshot` with `error`, `toRoute`, `fromRoute`, and `version` fields. Resets on `TRANSITION_SUCCESS`. Skips update when no error exists (avoids unnecessary re-renders).
