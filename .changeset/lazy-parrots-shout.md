---
"@real-router/core": minor
---

Route defaults are routed by channel (#1549, RFC-4 M2 §4 follow-up) — superseded within this release by "the slot IS the channel" (#1548)

⚠ **Read the `core-slot-is-the-channel` entry first; it revises everything
below.** This change routed a route's own `defaultParams` by the route's
`?`-declaration, so a default spelled for a query name landed in `state.search`.
A later commit in the same release removed the routing entirely: the SLOT is the
channel, and a `defaultParams` naming a key the route declares with `?` is now
**refused at registration** rather than re-channelled. The migration is therefore
not "read it from `state.search`" but "spell it in `defaultSearch`".

What survives from this change, because it is about the merge and not the
routing:

- The `matchPath` URL rebuild resolves declared query names search-first, so
  `state.path` honours the URL's query value over a query default
  (`match("/x?page=9")` no longer rebuilds `/x?page=5`).
- `buildPath(name, params, search)` merges query defaults into the query string
  instead of silently dropping them (`buildPath("x", {}, { sort: "asc" })` →
  `/x?page=5&sort=asc`); an explicitly-passed value still wins.
- Colliding names (`/items/:id?id`) stay path-owned — the #843 precedence is
  untouched.
- An **arbitrary** (declared-nowhere) default keeps its home in `state.params`.
