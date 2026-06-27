---
"@real-router/core": patch
---

Fix `subscribeLeave` `signal.reason` on the failure path (#943)

When a navigation fails after the `LEAVE_APPROVED` phase — a sync `subscribeLeave` listener throws, or an activation guard rejects — the leave `signal` now aborts with the originating error as `signal.reason`: a `RouterError` (e.g. `CANNOT_ACTIVATE`) or the exact value the listener threw, instead of a generic `DOMException [AbortError]`. This makes the failure path consistent with the cancellation path, which already aborts with `RouterError(TRANSITION_CANCELLED)`. A listener that stashes the `signal` and inspects `reason` asynchronously can now tell *why* the departure was reverted.
