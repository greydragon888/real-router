---
"@real-router/navigation-plugin": patch
---

Fix `#pendingTraverseKey` leak when `browser.traverseTo` throws (#526)

If `browser.traverseTo` rejected inside `onTransitionSuccess` (e.g., the target entry was evicted by the Navigation API under memory pressure), `#pendingTraverseKey` was left set — the next transition would then replay the traverse against the same broken key. The key is now consumed **before** the call, so any throw at the traverse site cannot poison subsequent transitions. Symmetric with the existing `isSyncingFromRouter` reset in `finally`.
