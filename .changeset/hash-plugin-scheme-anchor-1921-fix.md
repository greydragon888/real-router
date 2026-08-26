---
"@real-router/hash-plugin": patch
---

Read the scheme only where a scheme can be (#1921, #1836)

`safeParseUrl` located the scheme with an unanchored `indexOf("://")`, so for a
relative URL the first `://` was whatever the query or fragment happened to
carry, and everything before it was discarded.

Hash routing degraded worse than the other two URL plugins: `hashUrlToPath`
reads the parsed `.hash`, which the misparse EMPTIED, so `extractHashPath("")`
returned `"/"` and the route was erased outright rather than merely resolved
wrong. `#/login?returnTo=https://app.io/dash` landed on the index route.

The scheme is now matched against RFC 3986's shape in first position only.
Absolute URLs and non-HTTP schemes (#496) are unchanged.
