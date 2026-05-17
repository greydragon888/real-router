---
"@real-router/react": minor
---

Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components (#604)

Two paired components for opt-in client/server rendering boundaries that
formalize the `useState`/`useEffect` "isMounted" idiom every SSR app
re-implements:

- `<ClientOnly fallback={…}>{children}</ClientOnly>` — server emits
  `fallback` (or nothing), client matches it on first paint, then a single
  post-mount effect swaps in `children`. Use for browser-API consumers
  (window/document/intersection observers), ad slots, or third-party widgets
  that hydrate to the right shape without a hydration mismatch.
- `<ServerOnly fallback={…}>{children}</ServerOnly>` — server emits
  `children`, client matches them on first paint, then swaps to `fallback`
  (or hides). Use for SEO-only meta strips, zero-JS sections inside an
  otherwise-hydrated page.

Both components are exported from `@real-router/react`, `@real-router/react/legacy`,
and re-exported as types under the `react-server` condition.

```tsx
import { ClientOnly, ServerOnly } from "@real-router/react";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

<ServerOnly>
  <SeoHelpStrip />
</ServerOnly>
```
