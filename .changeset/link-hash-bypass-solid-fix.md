---
"@real-router/solid": patch
---

fix: `<Link hash>` no longer swallows hash-only navigation when the query is written as a string (#1555)

The same-route hash bypass in `navigateWithHash` decided "is this the link I am
already on?" with its own `Object.is`-per-key comparison. The URL direction parses
`?page=2` into the **number** `2`, while a `<Link routeSearch={{ page: "2" }}>`
prop carries the string the consumer wrote — so the two never matched, the bypass
did not fire, core rejected the click as `SAME_STATES`, and the fragment never
changed. The link looked dead.

The question now goes to `router.isActiveRoute`, which owns it: it carries the
channel rule (RFC-4 M2) and the provenance-tolerant value comparison (#1554), so
the two spellings of the same location compare equal because they print the same
URL.

No API change. The bypass still refuses to fire for a different route, a different
path param or a genuinely different query value — `force: true` must never smuggle
a real navigation through as a hash change.
