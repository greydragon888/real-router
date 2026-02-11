---
"@real-router/types": minor
---

Add guard API and Navigator type signatures (#42)

- Add `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard` to Router interface.
- Add `canNavigateTo` to Router and Navigator interfaces.
- Remove deprecated `canActivate` and `canDeactivate` from Router interface.
