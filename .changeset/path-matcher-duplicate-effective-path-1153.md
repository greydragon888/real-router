---
"@real-router/core": minor
---

Reject two routes that compile to the same effective path at registration (#1153)

Two routes resolving to the same URL — a flat `/a/b` and a nested `a` → `b`, trailing-slash variants `/x` and `/x/`, or two routes both at `/` — silently shadowed each other: the later's full insertion overwrote the earlier's trie terminal, so the shadowed route stayed alive by name but its deep link resolved to the wrong route (`buildPath(first)` then emitted a URL matching the second). The existing sibling-path duplicate gate compared only raw path strings among direct siblings, so it never saw collisions that materialize only in the compiled trie. Registration now throws `Duplicate route path`: a STRONG (full-insertion) terminal write rejects a second strong write by a different route, while a WEAK (optional-omit fallback) owner is legitimately displaced and a same-route revisit is idempotent — neither throws.
