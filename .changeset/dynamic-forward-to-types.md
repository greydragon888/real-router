---
"@real-router/types": minor
---

Add `ForwardToCallback` type for dynamic route forwarding (#43)

New generic type `ForwardToCallback<Dependencies>` — a sync callback `(getDependency, params) => string` that enables runtime-conditional route forwarding.
