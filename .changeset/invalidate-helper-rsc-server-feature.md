---
"@real-router/rsc-server-plugin": minor
---

Add `invalidate(router, "rsc")` helper for client-side revalidation (#605)

Marks the `"rsc"` namespace as stale on the given router. The next
navigation (including a same-route reload) re-runs the RSC loader for
the destination route and overwrites `state.context.rsc` (and the mode
marker) via the plugin's `subscribeLeave` listener — fresh `ReactNode`
lands on the state snapshot **before** `TRANSITION_SUCCESS` fires, so
subscribers see the new payload.

`void` (fire-and-forget) return. Compose with the existing core API
for an explicit synchronous round-trip:

```ts
import { invalidate } from "@real-router/rsc-server-plugin";

// Fire-and-forget — stale until any next navigation
invalidate(router, "rsc");

// Explicit await — pair with a same-route reload
invalidate(router, "rsc");
await router.navigate(state.name, state.params, { reload: true });
```

Surgical alternative to `router.navigate({ reload: true })` for
multi-namespace routes: only `"rsc"` re-runs; a side-by-side
`ssr-data-plugin` keeps its cached `state.context.data` on this same
transition unless its own `invalidate()` was also called. Behaviour
during an in-flight transition is deferred — the current transition
completes unchanged; the *following* navigation consumes the flag,
preserving the invariant "one transition = one `state.context`
snapshot".
