---
"@real-router/vue": patch
---

Fix per-request router leak in the `v-link` directive stack under SSR (#779)

`RouterProvider` pushed its router onto the module-level `v-link` directive
stack unconditionally in `setup()`, but the release runs in `onScopeDispose`,
which never fires during `renderToString` (the canonical per-request SSR flow
never calls `app.unmount()`). The stack therefore grew by one entry per request
and strong-referenced every per-request router — a leak `router.dispose()`
cannot clear. The push is now guarded to the browser (`typeof document`), since
the directive only ever runs in mounted client DOM; the client and hydration
contract is unchanged.
