---
"@real-router/browser-plugin": patch
---

Fix: factory-pool `stop()`/`dispose()` of an earlier router no longer disconnects the live router's listeners (#1213)

When one plugin factory is shared across multiple routers (a pool), the last router to `start()` owns the shared popstate + hashchange listener slots (last-wins, #758). But `onStop`/`teardown` cleared those slots **unconditionally**, so stopping or disposing an *earlier* router removed the *active* router's listeners — the live router went deaf to back/forward and external hash changes. The lifecycle now captures its own remover at `onStart` and clears the shared slot only while it still owns it (`createPopstateLifecycle` + the factory's hashchange listener).
