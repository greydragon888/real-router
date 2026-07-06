---
"@real-router/core": minor
---

Reject three more malformed route configs at registration (#1242)

The wave-3 registration-hardening batch — malformed configs that registered silently but produced dead or aliased routes now throw with a route-contextual message, like the #858/#1050/#1150/#1151/#1154 rejects:

- A **query-param name that leaked a constraint** via a reverse-order modifier typo (`/a/:b?<\d+>` — the `?` parses as the query start, so `<\d+>` becomes the query name) (§5.1).
- A **path-param ↔ query-param name collision** (`/a/:tab?tab`), where `buildPath` emitted the value twice (`/a/x?tab=x`) (§5.3).
- An **index route (`path: "/"`) under an optional-param or splat parent** (`/a/:b?`, `/files/*rest`), which was unreachable or inconsistent. A required-param parent's index is unaffected (§5.4).

Two findings were resolved without a behaviour change: `<…>` in a static segment (§5.5) is already caught by #1150, and `?name=value` in a route definition (§5.2) is left tolerated — bare core accepts it and it never declared a default — both documented.
