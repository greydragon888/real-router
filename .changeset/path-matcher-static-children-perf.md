---
"@real-router/core": patch
---

perf: share a frozen empty sentinel for trie `staticChildren` (#1379)

Every trie node used to allocate its own `Object.create(null)` for
`staticChildren`, but the leaf-majority (one node per registered route) never
gains a static child — so each held an empty null-proto object purely to answer
the match-path `key in node.staticChildren` read. Registration now shares one
frozen empty sentinel across every fresh node and copies-on-write to a fresh
mutable map on the first static child; the match path is unchanged. Cross-router
`table-heap` (react, 10k routes, same-session CDP A/B): 8.59 → 7.71 MB (~10 %
less retained heap).
