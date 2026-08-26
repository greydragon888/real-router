---
"@real-router/navigation-plugin": patch
---

Read the scheme only where a scheme can be (#1921, #1836)

`safeParseUrl` located the scheme with an unanchored `indexOf("://")`, so for a
relative URL the first `://` was whatever the query or fragment happened to
carry, and everything before it was discarded — path and entire query alike.

The plugin reaches it through `matchUrl`, which is typed `(url: string) => State
| undefined` with no absolute-URL precondition, so
`matchUrl("/login?returnTo=https://app.io/dashboard")` resolved the route from
the query parameter's path. Its other uses — the Navigation API's
`event.destination.url` and `entry.url` — are absolute by contract and were
already correct.

The scheme is now matched against RFC 3986's shape in first position only.
