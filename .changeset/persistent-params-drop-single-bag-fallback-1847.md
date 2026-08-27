---
"@real-router/persistent-params-plugin": minor
---

Stop reading the caller's params bag as a query source (#1847)

The `buildPath` interceptor used to fall back to the caller's **params** bag when
no `search` was given, on the reasoning that "the matcher then reads the query out
of `params` (`search ?? params`), so that bag is the query source here". Core
retired that fallback — the query string is printed from the canonical query
channel alone — and the compensation outlived its cause.

It was not neutral. It made `buildPath` print an href that `navigate` refuses.
Measured, with `?lang` declared on the root path and `?mode` on the route:

```
buildPath("a", { lang: "fr" })    → /a?lang=fr             navigate → throws TypeError
buildPath("c", { mode: "dark" })  → /c?lang=en&mode=dark   navigate → throws TypeError
buildPath("a", {}, { lang: "de" }) → /a?lang=de            navigate → /a?lang=de   (control)
```

A `<Link>` rendered a URL whose click throws — the divergence class core closed
twice (#1552 / #1578), manufactured here.

**Migration.** Pass a tracked value in the `search` argument, which is what this
package's own docs have prescribed since #1572: `router.buildPath("page", {},
{ lang: "fr" })`, not `router.buildPath("page", { lang: "fr" })`. The retired
spelling is now ignored by `buildPath` exactly as core ignores it, and the stored
value prints instead.

Nothing changes for the supported spelling, for a path parameter, or for the
persistence itself.
