---
"@real-router/ssr-data-plugin": minor
---

Skip loader call on hydration when `data` namespace is pre-resolved (#596)

When `hydrateRouter()` is invoked, the plugin's `start` interceptor consults
the one-shot hydration scratchpad and reuses the server-resolved value at
`state.context.data` instead of running the loader a second time. Pure CSR
`start()` calls and subsequent post-hydration starts continue to run loaders
as today.
