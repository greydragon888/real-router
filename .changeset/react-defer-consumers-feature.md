---
"@real-router/react": minor
---

`useDeferred()` hook + `<Await>` and `<Streamed>` components for consuming `defer()` payloads (#610)

Three new exports paired with `defer()` in `@real-router/ssr-data-plugin`:

- `useDeferred<T>(key)` — reads the promise published by the loader at
  `state.context.ssrDataDeferred[key]`. Stable promise reference across
  renders within one navigation; integrates with React 19's `use(promise)`
  for native Suspense streaming. Returns a never-resolving promise (forever
  fallback) when the key is missing — surfaces consumer/loader key drift
  as a visible loading state.
- `<Await name="key">{(value) => …}</Await>` — ergonomic wrapper around
  `useDeferred(name)` + `use(promise)`, mirrors the SvelteKit `{#await}` /
  Solid `<Await/>` pair for cross-framework naming consistency. Main entry
  only — `use()` requires React 19.
- `<Streamed fallback={…}>{children}</Streamed>` — alias for
  `<Suspense fallback>` matching the cross-adapter "Streamed" naming.
  Available in both main and `/legacy` entries (legacy only ships
  `<Streamed>` + `useDeferred`, not `<Await>`).

`useDeferred` and `<Streamed>` ship in both the main entry and `/legacy`
(React 18+) entries. `<Await>` ships in the main entry only. The
`react-server` condition entry exposes the prop / option types only
(no client runtime).

```tsx
import { Streamed, Await, useDeferred } from "@real-router/react";

// High-level — cross-adapter naming
<Streamed fallback={<Spinner />}>
  <Await<Review[]> name="reviews">
    {(reviews) => <ReviewList items={reviews} />}
  </Await>
</Streamed>

// Low-level — React-native primitives
<Suspense fallback={<Spinner />}>
  <Reviews />
</Suspense>

function Reviews() {
  const reviews = use(useDeferred<Review[]>("reviews"));
  return <ReviewList items={reviews} />;
}
```

Pairs with `injectDeferredScripts` from `@real-router/ssr-data-plugin/server`
for the server-side wire format. Non-breaking addition — existing
`<Suspense>` + `use(promise)` patterns continue to work unchanged.
