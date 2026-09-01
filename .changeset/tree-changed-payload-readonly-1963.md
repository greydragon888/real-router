---
"@real-router/core": minor
---

A `TREE_CHANGED` payload is read-only in the type, not only in the prose (#1963)

**Breaking type change, no runtime change.** The payload arrays are typed
`readonly ReadonlyRoute<D>[]` instead of `readonly Route<D>[]`, so a write to a
payload route is a compile error at every layer rather than at one:

```ts
event.added[0].name = "x";              // was allowed by the type → threw at runtime
event.added[0].defaultParams.id = "x";  // was allowed by the type → corrupted silently
```

The second is the one that mattered. Core copies one level (#1958), so
`event.added[0].defaultParams` is simultaneously the live store's object and the
caller's own literal — that write moved the router's answer AND the application's
bag, with no diagnostic on either side.

`ReadonlyRoute<D>` is exported from `@real-router/core/types` and is derived from
`Route<D>`, so a field added to the input type cannot arrive writable on the read
side. `Route` itself is unchanged — a caller building a route literal still writes
to it freely.

Migration: a consumer that mutates a payload (which the docs already forbid) must
copy first. Swept across the repository — the three `subscribeChanges` consumers
type-check unchanged.
