---
"@real-router/angular": minor
---

Add generic type parameter to `injectRoute<P>()` / `RouteSignals<P>` (#464)

`injectRoute<P>()` now accepts an optional generic so `routeState().route?.params` is typed without `as` casts. `RouteSignals<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the function.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const route = injectRoute<SearchParams>();
const q = route.routeState().route?.params.q; // typed as string
```
