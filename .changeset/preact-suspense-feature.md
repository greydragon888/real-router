---
"@real-router/preact": minor
---

Add `fallback` prop to `RouteView.Match` for Suspense support (#325)

When `fallback` is provided, children are automatically wrapped in `<Suspense>` from `preact/compat`.
