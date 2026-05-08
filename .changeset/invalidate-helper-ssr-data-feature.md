---
"@real-router/ssr-data-plugin": minor
---

Add `invalidate(router, "data")` helper for client-side revalidation (#605)

Marks the `"data"` namespace as stale on the given router. The next
navigation (including a same-route reload) re-runs the loader for the
destination route and overwrites `state.context.data` (and the mode
marker) via the plugin's `subscribeLeave` listener — fresh data lands
on the state snapshot **before** `TRANSITION_SUCCESS` fires, so
subscribers see the new payload.

`void` (fire-and-forget) return — honest semantics. Compose with the
existing core API for an explicit synchronous round-trip:

```ts
import { invalidate } from "@real-router/ssr-data-plugin";

// Fire-and-forget — stale until any next navigation
invalidate(router, "data");

// Explicit await — pair with a same-route reload
invalidate(router, "data");
await router.navigate(state.name, state.params, { reload: true });
```

Closes the parity gap with Nuxt `useAsyncData(...).refresh()` and
SolidStart `redirect("/path", { revalidate })`. Surgical alternative
to `router.navigate({ reload: true })`: only `"data"` re-runs;
companion plugins (e.g. `rsc-server-plugin`) keep their cached
`state.context.<ns>` unless their own `invalidate()` was also called.
