---
"@real-router/navigation-plugin": patch
---

Fix: factory-pool `stop()`/`dispose()` of an earlier router no longer disconnects the live router's navigate listener (#1213)

When one plugin factory is shared across multiple routers (a pool), the last router to `start()` owns the shared navigate-event listener slot (last-wins, #758). But `createNavigateLifecycle`'s `onStop`/`teardown` cleared that slot **unconditionally**, so stopping or disposing an *earlier* router removed the *active* router's listener — the live router went deaf to browser navigate events. The lifecycle now captures its own remover at `onStart` and clears the shared slot only while it still owns it. (Confirmed as the third env-plugin instance of the same shared-slot ownership pattern, alongside browser-plugin and hash-plugin.)
