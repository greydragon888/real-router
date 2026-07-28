---
"@real-router/core": minor
---

Route `buildPath` through the nav pipeline, retiring its single-bag query form (nav-pipeline Phase 2, step 2-1)

`buildPath` composed its URL by hand and leaned on the matcher's `search ?? params`
fallback, which printed a query string out of the PATH bag. That made it the one
producer disagreeing with `navigate`, `makeState` and the `matchPath` rebuild on
the same intent. It now runs stage ③ and the mode gate through `canonicalize` in
its LITERAL form — `{ resolveForward: false }`, the first growth of the pipeline's
API — and prints the query from the canonical query channel alone.

**Behaviour changes.** The query string is no longer printed from the params bag:

```ts
// Route: /x?page
buildPath("x", { page: "2" });        // "/x"          (was "/x?page=2")
buildPath("x", {}, { page: "2" });    // "/x?page=2"   unchanged

// Route: /t (loose mode) — an undeclared key
buildPath("t", { foo: "1" });         // "/t"          (was "/t?foo=1")
buildPath("t", {}, { foo: "1" });     // "/t?foo=1"    unchanged

// Route: /items/:id?id — the #843 collision
buildPath("i", { id: "V" });          // "/items/V"    (was "/items/V?id=V")

// Route: /s with defaultParams { theme: "dark" } — an ARBITRARY default
buildPath("s");                       // "/s"          (was "/s?theme=dark")
```

Every one of these is what `navigate` already committed for the same intent, so
the step removes divergence rather than adding it. An arbitrary default (declared
by neither a path slot nor `?name`) is app-level data living in `state.params`,
exactly as documented — only `buildPath` used to print it.

`forwardTo` is still NOT resolved here (A.5): `buildPath("src")` stays `/src`.

**The route's default never replaces a value you supplied.** With the seam out of
the picture there is nothing to enforce "a default is never applied to a slot the
caller already filled — in EITHER bag" (INVARIANTS canonicalize #6), so the
literal form enforces it itself: on `defaultSearch { page: "5" }`,
`buildPath("x", { page: "9" })` prints `/x`, not `/x?page=5`. The key you spelled
in the path bag is not printed — that is the single-bag retirement — but the
default does not take its place, which would be the very priority inversion the
channel split exists to remove.

Plugins are unaffected: `persistent-params` already injects into the search
channel in its own `buildPath` interceptor, and that interceptor zone is untouched
(#1231).
