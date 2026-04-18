---
"@real-router/react": minor
---

Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` (#464)

`useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. The generic is erased at compile time — no runtime change. `RouteContext<P>` is likewise generic, defaulting to `Params`.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const { route } = useRoute<SearchParams>();

route?.params.q;    // typed as string — no cast needed
route?.params.sort; // typed as string
```
