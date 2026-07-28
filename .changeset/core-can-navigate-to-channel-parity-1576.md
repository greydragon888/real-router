---
"@real-router/core": minor
---

Answer `false` from `canNavigateTo` for a mis-channelled params bag (#1576)

`canNavigateTo` is a capability predicate in parity with `navigate` — it answers
whether that navigation would work. Since the channel guard's P1 became a throw
(#1572), a declared query key handed in the `params` bag made `navigate` throw a
synchronous `TypeError` while the predicate still answered `true`: an adapter got
a green light for a link whose click throws.

The predicate already had a written policy for exactly this situation and honoured
it for the other rejection reason — a missing required path param returns `false`
rather than letting `buildPath` throw (#725). It now mirrors the channel rejection
the same way, reading the RAW caller bag against the RAW route name, so it is
neither stricter nor laxer than the verb:

```ts
// Route: { name: "search", path: "/search?q" }
router.canNavigateTo("search", { q: "shoes" }); // false (was: true)
router.navigate("search", { q: "shoes" }); // throws — unchanged
router.canNavigateTo("search", {}, { q: "shoes" }); // true — unchanged
```

Still navigable, in the predicate and in `navigate` alike: a name occupying both
a path slot and a query declaration (`/items/:id?id`) is legitimately path-owned
(#843 / #1549), and an `undefined` value is the removal marker, not a value in
the wrong channel (#1550 / #1551).

`false` rather than a rethrow: a predicate answers, it never throws, and it runs
on every `<Link>` render across six adapters — which is why P1 deliberately does
not instrument the predicates. Not instrumented does not mean blind.
