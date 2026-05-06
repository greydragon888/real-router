---
"@real-router/rsc-server-plugin": minor
---

Skip loader call on hydration when `rsc` namespace is pre-resolved (#596)

When `hydrateRouter()` is invoked and the parsed state contains the `rsc`
namespace (uncommon — `serializeRouterState({ excludeContext: ["rsc"] })` is
the typical SSR config), the plugin's `start` interceptor reuses the value
instead of re-running the loader. Stripped-rsc payloads continue to fall
through to the loader as today.
