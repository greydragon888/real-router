---
"@real-router/core": minor
---

Normalize a missing leading slash in route paths at the tree-build boundary (#1407)

A route path without a leading `/` — a relative segment (`foo`, `:id`), or an absolute `~foo` written without the slash — was silently mis-registered as a dead route (`buildPath` emitted a URL its own `match` rejected) or threw a cryptic "Empty parameter name". `createNode` now prepends `/` after the `~`-strip, so:

- a relative child (`:id`, `foo`) no longer fuses onto its parent across the segment boundary (`/a` + `:id` → `/a/:id`, not the dead `/a:id`);
- a slash-less absolute (`~dashboard`) becomes `/dashboard` and round-trips;
- a relative path ending in a bare marker (`a:`) registers as the static `/a:` instead of throwing.

A leading-`/`, `~/`, `?query`, or empty root path is untouched. This aligns with every major router (TanStack/Vue/React all forgive a missing slash) and makes `validateRoutePath`'s already-documented "relative segments / `~path` are valid" contract actually true.
