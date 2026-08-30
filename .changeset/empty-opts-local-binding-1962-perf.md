---
"@real-router/core": patch
---

Bind the navigation hot path's imported values locally at module load ([#1962](https://github.com/greydragon888/real-router/issues/1962))

No behaviour changes and no consumer-visible effect: the shipped bundle inlines
an imported binding and a locally-aliased one identically, so this is byte-for-byte
the same work for anyone who installs the package.

What it changes is what the repository's own benchmark suite MEASURES. That suite
runs `tsx` over `src`, where an imported binding is a property access on the module
namespace — a getter call — rather than a local. Three such accesses sit on every
navigation after the entry door landed:

- `Router.navigate` reads `EMPTY_OPTS` (moved from a module-local `const` into
  `constants.ts` so the door could recognise it by identity);
- `adoptNavigationOptions` reads the same singleton for its fast path;
- `executeNavigation` calls `adoptNavigationOptions` across a module boundary.

Each is now read once at module load and used as a local. The singleton is
aliased, never re-declared — the entry door matches it by IDENTITY, and two
objects would silently disable the fast path (pinned by
`options-entry-door-1962` → "reuses ONE shared empty record").
