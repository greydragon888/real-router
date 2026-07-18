---
"@real-router/browser-plugin": patch
---

Source the `isState` re-export from the local browser-env state guard

The `isStateStrict as isState` re-export now comes from `shared/browser-env/state-guard.ts` (a byte-identical twin) instead of the dissolved `type-guards` package. Internal refactor — the public `isState` export and its `history.state` validation behaviour are unchanged.
