---
"@real-router/core": patch
---

Fix `createRequestScope` close-listener leak when `cloneRouter` throws (#969)

`createRequestScope` (the SSR per-request helper) attached the Node `"close"`
listener to the request *before* calling `cloneRouter`. If `cloneRouter` threw
(e.g. `ROUTER_DISPOSED` on an already-disposed base), the helper exited via the
exception without returning a scope handle, so the listener could never be
detached — it leaked on the request object. The listener is now attached only
after `cloneRouter` succeeds (clone-before-attach); `cloneRouter` is synchronous,
so no `"close"` event can fire in the gap. The Web (`RequestLike`) branch is
unaffected — it never attaches a listener.
