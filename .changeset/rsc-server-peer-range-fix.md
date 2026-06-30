---
"@real-router/rsc-server-plugin": patch
---

Widen `@real-router/core` peer range to prevent unwanted major bumps (changesets/changesets#822)

The peer dependency was `workspace:^`, published as `^0.62.0` — patch-only on 0.x,
so any core minor bump went out of range and changesets escalated this package to a
major bump. Changed to `workspace:>=0.1.0` (publishes as `>=0.1.0`), keeping core
minor bumps in range. Backward-compatible range widening — no consumer breakage;
works in tandem with the existing `onlyUpdatePeerDependentsWhenOutOfRange: true`.
