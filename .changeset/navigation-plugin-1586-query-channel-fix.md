---
"@real-router/navigation-plugin": patch
---

Keep the query channel on traverse and on guard-rejection recovery (#1586)

Two call sites written before the RFC-4 M2 channel split (#1548) rebuilt a
navigation from a state's `name` + `params` alone, silently dropping its query:

- `traverseToLast(name)` committed `navigate(matchedState.name, matchedState.params)`.
  The browser still traversed to the entry's full URL, so pressing Back onto a
  page whose URL had `?tab=a` landed on the page without it — address bar and
  router describing different pages, and a second Back/Forward round trip
  disagreeing with what was displayed. This is the output half of the journey
  #449 fixed on the input side: `matchedState.search` has been populated since
  that fix, and this call threw it away one line later.
- `syncUrlToRouterState` (the `CANNOT_DEACTIVATE` / crash-recovery path) rebuilt
  the URL with `undefined` in the query slot and wrote a buffered entry state
  without `search`. A guard that blocked a back-navigation away from
  `?tab=a&sort=z` left the user on the bare path while `state.path` still held
  the query, and made recovery the one writer producing a narrower history entry
  than every other.
