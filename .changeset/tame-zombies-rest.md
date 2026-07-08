---
"@real-router/core": patch
---

Fix a pre-bound `usePlugin` reference registering a zombie plugin after `dispose()` (#1196)

A `usePlugin` reference captured before `dispose()` (`const up = router.usePlugin`) bypassed the post-dispose method swap and reached the real implementation, so the factory ran on the disposed router (real side effects), listeners landed in the cleared emitter, and `teardown` never fired. It now throws `ROUTER_DISPOSED` like every other mutating method — mirroring the #946 guard for `subscribe` / `subscribeLeave`.
