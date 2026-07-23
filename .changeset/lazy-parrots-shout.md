---
"@real-router/core": minor
---

Route `defaultParams` by channel: a default declared for a query name lands in `state.search`, not `state.params` (#1549, RFC-4 M2 §4 follow-up)

- A default for a **declared query** name (`?page` + `defaultParams.page`) now lands in `state.search` on every state-building path (match, navigate v1 single-bag, explicit search channel, `canNavigateTo`, plugin `makeState`); a **path** default and an **arbitrary** (undeclared, non-path) default keep their v1 home in `state.params`. Previously a query-typed default stayed in `state.params` (match path) or was duplicated across both channels (navigate path).
- `makeState` is the single canonicalization point: any declared-query key in the final params bag (default, caller param, or decoder-injected) is routed to `state.search`, with an explicit `search` value winning over it. Colliding names (`/items/:id?id`) stay path-owned — the #843 precedence is untouched.
- The `matchPath` URL rebuild resolves declared query names search-first, so `state.path` now honors the URL's query value over a query-typed default (`match("/x?page=9")` no longer rebuilds `/x?page=5`).
- `buildPath(name, params, search)` with an explicit search bag now merges query-typed defaults into the query string instead of silently dropping them (`buildPath("x", {}, { sort: "asc" })` → `/x?page=5&sort=asc`); an explicitly-passed search value still wins.
- The v1 single-bag navigate split no longer routes default-originated non-query keys to `state.search` — an arbitrary default is no longer duplicated into the search channel, and an explicit override of such a default replaces it in `state.params` instead of splitting the value across channels.

**Migration:** code reading a query-typed default from `state.params` must read it from `state.search` (where explicitly-passed query values already live).
