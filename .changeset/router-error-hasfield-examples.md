---
"@real-router/core": patch
---

`RouterError.hasField`'s examples now show the three fields its note claims for it (#2126)

The `⚠` beside `hasField` argues that `toJSON`'s `excludeKeys` is the wrong set to reuse, because it excludes `code`, `segment` and `path` "which this method documents as answering `true`". The docstring demonstrated only `segment`, so the claim rested on two examples that were not there.

Both are added, and the answers are measured rather than assumed: on a `RouterError` carrying `segment` and `path`, `hasField` returns `true` for `code`, `segment`, `path` and a field added through `setAdditionalFields`, and `false` for a name the error does not carry. Behaviour is unchanged — `hasField` is still `Object.hasOwn` (#1829).
