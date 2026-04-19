---
"@real-router/validation-plugin": minor
---

Reject `warnListeners > maxListeners` cross-field combination (#471)

`validateLimits` now throws `RangeError` when `limits.warnListeners` exceeds `limits.maxListeners` (and `maxListeners > 0`). Previously both bounds were checked only in isolation, so `{ warnListeners: 5000, maxListeners: 100 }` passed validation yet the warning channel was dead code — the hard cap would always fire first.

The check fires both on router construction (when validation-plugin is installed) and through any direct `validateOptions` / `validateLimits` call. `maxListeners: 0` (unlimited) disables the cross-check, matching the existing "0 means unlimited" convention.
