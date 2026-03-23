---
"@real-router/solid": minor
---

Add `fallback` prop to `Match` for Suspense support (#325)

When `fallback` is provided, matched content is automatically wrapped in `<Suspense>` from `solid-js`.
