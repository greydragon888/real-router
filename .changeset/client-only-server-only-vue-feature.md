---
"@real-router/vue": minor
---

Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components (#604)

Two paired components for opt-in client/server rendering boundaries.
Built on `ref` + `onMounted` — slots `default` and `fallback` switch
based on the mount state. Server emits the SSR-side branch, client
matches it on first paint, then `onMounted` flips the rendered slot.

```vue
<ClientOnly>
  <BrowserApiWidget />
  <template #fallback>
    <Skeleton />
  </template>
</ClientOnly>
```

Or with the render function:

```ts
import { h } from "vue";
import { ClientOnly } from "@real-router/vue";

h(ClientOnly, {}, {
  default: () => h(BrowserApiWidget),
  fallback: () => h(Skeleton),
});
```
