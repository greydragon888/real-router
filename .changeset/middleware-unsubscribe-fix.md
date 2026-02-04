---
"@real-router/core": patch
---

Make middleware unsubscribe function idempotent (#53)

Calling unsubscribe multiple times no longer throws an error.
