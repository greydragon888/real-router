---
"@real-router/core": patch
---

Fix O(2^N) trie registration for consecutive optional params (#849)

Registering a route with N consecutive optional params (e.g.
`/x/:a?/:b?/.../:z?`) took exponential time: every optional forked the trie
insertion into a take-the-param and a skip-the-param branch, and those branches
re-explored the same `(node, position)` pairs without memoization (N=22 ≈ 475 ms,
doubling per added optional). The resulting trie was small — only the work blew
up — so a pathological route config could hang router startup.

`insertIntoTrieFrom` now records visited `(node, start)` pairs per insertion and
skips repeats. Inserting from a given `(node, start)` is deterministic and its
side effects are idempotent, so this is behavior-preserving (same trie, same
matches) and collapses the fan-out to polynomial — N=40 now registers in well
under a millisecond. A stress guard locks the sub-second ceiling.
