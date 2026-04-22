---
"@real-router/navigation-plugin": patch
---

Replace `new URL()` with `safeParseUrl()` on the navigate-event hot path (#496)

`handleNavigateEvent` used `new URL(event.destination.url)` to extract
`pathname` + `search`. The `safeParseUrl` manual parser (already on the
hot path via `entryToState`) is 4–6× faster and allocates no `URL` object.

This removes one `URL` construction per browser-initiated navigation
(back/forward, link click, programmatic `navigation.navigate()`).
No behavior change — the Navigation API guarantees absolute URLs, and
`safeParseUrl` returns identical `pathname`/`search` for them.
