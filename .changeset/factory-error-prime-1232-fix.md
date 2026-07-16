---
"@real-router/angular": patch
---

Prime the per-request error source in `provideRealRouterFactory` (SSR/SSG) (#1232)

`provideRealRouterFactory` did not eagerly create the per-request error source, so a navigation error firing after a successful `start()` but before a lazily-rendered `RouterErrorBoundary` mounts was invisible — the boundary created its error source lazily on init, after the error, and stayed silent. `provideRealRouter` (SPA) already primed it (#778); the factory path lacked the symmetric call. The prime now runs inside the async bootstrap initializer (not a `provideEnvironmentInitializer`) so a router-clone failure — e.g. a disposed `baseRouter` — stays on the Option-A async-reject path instead of becoming a synchronous bootstrap throw.
