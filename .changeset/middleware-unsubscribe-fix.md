---
"@real-router/core": patch
---

Make middleware unsubscribe function idempotent

Calling unsubscribe multiple times no longer throws an error.
