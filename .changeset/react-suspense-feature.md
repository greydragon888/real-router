---
"@real-router/react": minor
---

Add `fallback` prop to `RouteView.Match` for Suspense support (#325)

When `fallback` is provided, children are automatically wrapped in `<Suspense>`. Works with both `keepAlive` (Activity) and non-keepAlive modes.
