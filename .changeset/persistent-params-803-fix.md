---
"@real-router/persistent-params-plugin": patch
---

Fix persistent param removal committing before guards on a rejected/cancelled navigation (#803)

Removing a persistent param via `navigate(name, { key: undefined })` no longer drops the param permanently when the navigation is rejected by a guard or superseded by a concurrent navigate. The removal is now committed in `onTransitionSuccess`, against the state that actually committed, so a transition that never commits leaves the param intact.

- `forwardState` records removals transiently instead of mutating the tracked set/snapshot before guards run; the paired `buildPath` consumes the record so the built URL still drops the removed param for the current transition.
- Permanent removal (from both the snapshot and the tracked param set) happens in `onTransitionSuccess`, keyed on the committed state — a successful removal stays permanent (unchanged), while a rejected/cancelled one rolls back.
