---
"@real-router/core": patch
---

The options deep-freeze no longer invokes the getters it freezes (#1796 follow-on)

`deepFreeze` walked the merged options with `Object.values`, which CALLS every
own-enumerable getter it passes. Sealing a slot needs no such read, and the
caller's `queryParams` bag is accessor-backed by contract — so construction read
each format field twice, once here and once in `snapshotQueryParams`.

Two readers compound. A bag whose getter constructs another router branched
twice per level instead of once: measured at depth 25, two million getter calls
in 32s and still running, against 26 calls in 4ms with a single reader. The walk
reads property descriptors now, so an accessor is never INVOKED — though on a Proxy-backed bag the descriptor read is itself the caller's trap, so the walk contributes to the count
and what gets frozen is unchanged for every data-backed bag.
