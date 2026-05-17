---
"@real-router/preact": minor
---

Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components (#604)

Two paired components for opt-in client/server rendering boundaries.
Server emits the SSR-side branch (fallback for `<ClientOnly>`, children
for `<ServerOnly>`), client matches it on first paint, then a single
post-mount effect swaps the rendered branch.

```tsx
import { ClientOnly, ServerOnly } from "@real-router/preact";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>
```
