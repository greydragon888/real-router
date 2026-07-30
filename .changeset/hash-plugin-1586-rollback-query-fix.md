---
"@real-router/hash-plugin": patch
---

Keep the query channel on popstate rollback (#1586)

`rollbackUrlToCurrentState` (shared with `browser-plugin`) rebuilt the visible
URL from `name` + `params` alone, so a guard rejection or an unmatched
back-navigation away from `#/users/list?page=2&sort=asc` restored
`#/users/list`. The plugin does not track fragments, so only the query was
affected here.

The existing rollback assertion could not see it: it built its expectation with
the same omission, which stays a tautology for as long as both sides drop the
same channel.
