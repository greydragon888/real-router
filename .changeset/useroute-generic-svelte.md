---
"@real-router/svelte": minor
---

Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` (#464)

`useRoute<P>()` now accepts an optional generic so `route.current?.params` is typed without `as` casts. `RouteContext<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the composable.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const { route } = useRoute<SearchParams>();
const q = route.current?.params.q; // typed as string
```
