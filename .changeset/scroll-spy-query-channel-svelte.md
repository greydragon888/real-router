---
"@real-router/svelte": patch
---

Scroll-spy no longer drops the query string while you scroll

The spy moves the hash by re-navigating to the SAME route, and it handed only
the path bag: `navigate(state.name, state.params, undefined, opts)`. Slot 3 is
the query channel since RFC-4 M2 (#1548), so a reader merely SCROLLING a page at
`/docs?tab=api` had the URL silently rewritten to `/docs` — the query gone,
without any interaction that asked for it. It now passes `state.search`, the
query the user is already looking at.

Fixed once in `shared/dom-utils/scroll-spy.ts`, so all six adapters get it.
