---
"@real-router/hash-plugin": patch
---

use core's published `adoptChannel` instead of a local copy (#2187)

The nested `params` / `search` of a restored `history.state` are snapshotted
shape-preservingly so the read a guard judges and the read the router commits
are the same read (#2141). That predicate was written locally because
`@real-router/core/utils` did not publish it; it does now, and the local copy is
retired. No behaviour change — `restore-nested-read-once-2141` owns the row per
refused shape and stays green across the swap.
