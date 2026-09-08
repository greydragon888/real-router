---
"@real-router/core": patch
---

A route batch is judged and copied in ONE walk (#2139)

Registration guarded the caller's array and then snapshotted it — two walks over
one container the caller owns. A `Proxy` array reports an ordinary data
descriptor, so the accessor ban never reaches it, and it simply answered a legal
element to the guard and an accessor-backed one to the snapshot. Measured on all
three registration doors (`createRouter`, `add`, `replace`): `has("kid")` false,
`has("evil")` true, for an element every one of those doors refuses outright
when it does not drift. The nested `children` array had the identical window.

`guardRouteStructure` now returns the batch it judged, and `snapshotRouteBatch`
is gone: the object-shape questions still run on the caller's value — a spread
turns `null`, `42`, `"ab"` and `[x]` into plain objects, so they have to — while
every reader below sees the snapshot that same visit produced. The
`registration · route.children` row in `read-count-authority` was the last one
standing at 2 and is 1 now.

⚠ The `children` write is `putField`, not `route.children = …` (#1852), at all
four sites that build a `{ name, path }` literal and hang children off it —
registration, `sanitizeRoute`, `nodeToDefinition` and `enrichRoute`. None of them
has an own `children` to overwrite, so the assignment walked the prototype:
measured under an ambient accessor, a setter swallowed the batch and a
getter-only accessor made `createRouter` and `getRoutesApi().get()` THROW
instead of answering.
