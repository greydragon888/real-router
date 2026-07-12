---
"@real-router/hash-plugin": patch
---

Collapse a not-found popstate storm to a single navigation (#1448)

A back/forward popstate that resolves to the `UNKNOWN_ROUTE` already committed
for the exact same path is now a no-op, instead of re-committing an identical
not-found state and re-notifying subscribers. This restores parity with the
matched-route branch, where a same-state popstate is already suppressed by
`navigateToState`'s `SAME_STATES` check — `navigateToNotFound` bypasses the
navigate pipeline, so the popstate handler now guards the redundant call itself.
A different not-found path still navigates; the short-circuit is path-specific.
