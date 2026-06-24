---
"@real-router/types": minor
---

Remove the unused `redirect` field from the router-error details type (#925)

The error-details type no longer declares `redirect: State | undefined` — it was never produced or consumed (guards return `boolean` only; redirect is declarative `forwardTo`). Paired with the `@real-router/core` change that drops the runtime field.
