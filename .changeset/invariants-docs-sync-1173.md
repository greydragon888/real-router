---
"@real-router/core": patch
---

Sync INVARIANTS.md with the shipped behavior and fix the stale FAST PATH 3 comment (#1173)

Documentation/tests only — no behavior change:

- INVARIANTS.md Router Lifecycle #7: "all 8 mutating methods" → 9 (`subscribeLeave` was added by #946); the property test's `blockedMethods` list now includes it too.
- INVARIANTS.md errorCodes #1: "all 11 required keys" → 14 (`CONTEXT_NAMESPACE_ALREADY_CLAIMED`, `REENTRANT_NAVIGATION`, `REENTRANT_TREE_MUTATION`).
- INVARIANTS.md subscribeChanges #3: documented the dispose-mid-dispatch carve-out (a handler that disposes the router is not a CRUD op, so the #1032 reentrancy ban does not apply — later handlers of the same emit observe the torn-down tree) + a pinning test.
- `transitionPath.ts` FAST PATH 3 comment: dropped the closed-#970 `canNavigateTo` paragraph (it builds its toState WITH meta since #970) and named the real meta-less producers (`navigateToState` / `replace()` revalidation, tracked as #1170).
