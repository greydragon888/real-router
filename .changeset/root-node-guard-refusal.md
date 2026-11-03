---
"@real-router/core": minor
---

`addActivateGuard("")` and `addDeactivateGuard("")` refuse the root node (#2895)

`""` names the root node, and the root is no segment: no navigation activates or deactivates it, `start()` included. A guard registered there was accepted and never called, so a refusing one let every navigation through. Both methods now throw a `TypeError` at registration:

`[router.addActivateGuard] A guard on the root node "" never runs: no navigation activates or deactivates the root`

`removeActivateGuard("")` and `removeDeactivateGuard("")` stay accepted and do nothing.

**Breaking Change:** a call that registers a guard on `""` throws.

**Migration:** delete the call — the guard it registered was never called. A check meant for every route goes on each top-level route: a navigation that enters a top-level route's subtree runs that route's guard.
