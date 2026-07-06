---
"@real-router/core": patch
---

Resolve param+splat junctions by a validated sub-traverse (#1288)

At a trie node carrying both a param child and a splat sibling, `match` no longer commits to the param branch on the strength of the current segment alone. The branch is tried on a scratch traversal and commits only when it structurally completes AND the reached route's constraints hold on the decoded scratch values; otherwise the splat sibling captures the remainder. One uniform rule — "param wins if its branch can complete" — replaces the former per-signal carve-outs and closes the remaining dead-deep-link family:

- a branch that dead-ends BELOW the junction now falls to the catch-all (`/*rest` + `/:v<v\d+>/edit` on `/v1/nope` was UNMATCH while `buildPath` emitted it);
- a constraint failing DEEPER in the branch now falls back too (`/*rest` + `/:v<v\d+>/:id<\d+>` on `/v1/abc`), including the multi-constraint slot where the disjunction passes but the reached route's own constraint fails (`/user/abc/a`);
- an UNCONSTRAINED param with a splat sibling — the former documented greedy carve-out — now also falls back when its branch cannot complete (`/user/:id/profile` + `/user/*rest` on `/user/x/settings`);
- the splat's specific-child candidate (`INVARIANTS` Matching #24) is constraint-validated before committing: `/files/*any` + child `/:id<\d+>` on `/files/xx` fell nowhere (the child won structurally, its constraint then killed the whole match) — it now falls back to the wildcard capture.

A completing take stays present-first, so every previously-matching URL keeps its exact result; the change is strictly match-widening. Nested junctions stay polynomial (a 32-level chain ≈ 85 µs, failures fall back locally — no cascades), and non-junction param hops never enter the new code path.

Closes #1288
