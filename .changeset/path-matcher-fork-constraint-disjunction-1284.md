---
"@real-router/core": patch
---

Fix a same-name constrained sibling dying under a splat sibling (#1284)

#1266 marked every constrained required param with `fork.constraint ??= <pattern>` — the constraint of the FIRST-registered route owning the trie slot. When a splat sibling was present, `match` used that single pattern as the slot-wide validity signal, so a value matching a LATER route's constraint failed the fork and fell to the catch-all — silently killing that route, registration-order dependent (`/user/:id<\d+>/a` + `/user/:id<[a-f]+>/b` + `/user/*rest` → `/user/abc/b` went to the catch-all). The fork now carries the DISJUNCTION of all constraints on the slot (composite of the anchored sources, one `.test`); `match` skips to the splat only when EVERY constraint fails, and post-traverse per-route validation still filters the correct winner.
