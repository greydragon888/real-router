---
"@real-router/core": patch
---

Suppress spurious "Unexpected navigation error" logs for guard-blocked fire-and-forget navigation (#721)

Add `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` to the fire-and-forget unhandled-rejection safety net's suppressed-error set. A guard returning `false` — or a plugin's guard-blocked `back()` / `forward()` routed through `navigateToState()` — is an expected navigation outcome, not an internal bug, yet such fire-and-forget calls previously emitted a misleading `logger.error("router.navigate", "Unexpected navigation error", …)`. Awaiting callers and `onTransitionError` plugins still receive the rejection.
