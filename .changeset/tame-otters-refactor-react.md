---
"@real-router/react": patch
---

Refactor internal `buildHref` DOM helper to a positional hash argument (#1442)

`buildHref(router, name, params, hash?)` now takes the hash fragment positionally instead of wrapping it in an options object, mirroring the existing `navigateWithHash(router, name, params, hash)` signature and removing the `hash === undefined ? undefined : { hash }` boilerplate at the `<Link>` call site. Internal-only helper (not a public export) — no public API surface or runtime behavior change; rendered hrefs are identical.
