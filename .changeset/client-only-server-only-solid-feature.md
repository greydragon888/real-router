---
"@real-router/solid": minor
---

Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components (#604)

Two paired components for opt-in client/server rendering boundaries.
Built on `createSignal` + `onMount` — `onMount` is SSR-safe and never
fires on the server, so the initial render emits the SSR-side branch.
After hydration, the signal flips and `<Show>` swaps the branch.

```tsx
import { ClientOnly, ServerOnly } from "@real-router/solid";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>
```
