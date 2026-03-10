---
"@real-router/sources": patch
---

Fix `RouteNodeSource` leaking router subscriptions on unmount (#270)

Converted `RouteNodeSource` from eager to lazy-connection pattern: the router subscription is now created on the first listener and removed when the last listener unsubscribes. Snapshot is reconciled with current router state on reconnection to handle Activity hide/show cycles. `destroy()` remains available but is no longer required.
