---
"@real-router/core": minor
---

`replace()`'s revalidation window refuses route-CRUD

Application code runs inside that window — the route's `decodeParams`, invoked
by the revalidating `matchPath`, and the new route's activation guards — while
the router holds a state it has not yet revalidated. Route-CRUD reached from
there committed a bag the route can no longer build:

```
committed                      x @ /x/1   params { id: "1" }
buildPath("x", { id: "1" })    throws  Missing required param 'slug'
```

Silently: `replace()` returned normally and `TRANSITION_SUCCESS` was emitted, so
nothing looked wrong until somebody rebuilt a URL from the state they were
handed — a break of the `buildPath` / `matchPath` round-trip on committed state.

A `subscribeChanges` handler was ALREADY refused this; the same code reached
through a decoder or a guard was not. What a piece of application code was
allowed to do therefore depended on which door it arrived through rather than on
the state the router was in. All six route-CRUD doors — `add`, `remove`,
`update`, `clear`, `replace` and `setRootPath` — now consult the window.

⚠ The refusal is `REENTRANT_TREE_MUTATION` and it throws SYNCHRONOUSLY. A
decoder is not isolated, so an app that does not catch it sees the error out of
`replace()` itself. The message names the remedy: defer with
`queueMicrotask(() => routes.replace(...))`.

Closes #1758.
