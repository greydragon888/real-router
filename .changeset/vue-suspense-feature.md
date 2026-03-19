---
"@real-router/vue": minor
---

Add `fallback` prop to `RouteView.Match` for Suspense support (#325)

When `fallback` is provided, matched content is automatically wrapped in Vue's `<Suspense>`. Works with both `keepAlive` and non-keepAlive modes.
