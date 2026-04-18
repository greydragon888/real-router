---
"@real-router/solid": minor
---

Add generic type parameter to `useRoute<P>()` (#464)

`useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. Returns `Accessor<RouteState<P>>`. The generic is erased at compile time — no runtime change.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const routeState = useRoute<SearchParams>();
const q = routeState().route?.params.q; // typed as string
```
