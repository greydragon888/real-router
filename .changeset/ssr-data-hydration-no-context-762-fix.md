---
"@real-router/ssr-data-plugin": patch
---

Handle a hydration source without a `context` field without crashing (#762)

A partial hydration source object (`{ name, path }` with no `context`) is type-legal via `hydrateRouter`'s `{ path: string }` object-source cast, yet the `start()` interceptor's `config.namespace in hydrationState.context` check threw a bare `TypeError: Cannot use 'in' operator to search for 'data' in undefined`. The shared SSR loader factory now guards `hydrationState.context !== undefined` before the lookup — a missing context is treated as "no server value for this namespace", so the loader runs normally. Behavior for every valid hydration input is unchanged.
